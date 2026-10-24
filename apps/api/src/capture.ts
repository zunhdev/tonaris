// Capture in the API (TS-22, TS-41, TS-44): `album.capture` asks its providers before it takes the owner's write lock.
// A capture is claimed first, so a copy sent while it runs answers `409 in_progress` and nothing runs twice. Then the
// link is identified, MusicBrainz is asked about its album and about saved albums it may have merged, and the domain
// command matches and saves under the lock. Answers decided before the lock, such as a choice to make, are stored
// like any outcome. Every other mutation runs as it always has.

import {
  claimMutation,
  executeMutation,
  findLinkedAlbum,
  finishMutation,
  mergeCandidates,
  releaseClaim,
  savedAlbumsOf,
  type Database,
  type ExecutedMutation,
} from "@tonaris/db";
import {
  actingUserId,
  failure,
  linkEntityId,
  type AlbumFacts,
  type CaptureArgs,
  type CaptureSource,
  type FoundFacts,
  type Mutation,
  type Outcome,
  type Principal,
} from "@tonaris/domain";
import {
  identificationOutcome,
  ProviderUnavailableError,
  unidentifiedReasons,
  type Identifier,
} from "@tonaris/providers";

/** What capture asks: the identification chain, and MusicBrainz's facts about a release group. */
export type CaptureDeps = {
  identify: Identifier["identify"];
  describe: (releaseGroupId: string) => Promise<AlbumFacts>;
};

/** Thrown when a mutation is claimed by another request that is still running it (TS-22). */
export class MutationInProgressError extends Error {
  constructor(readonly mutationId: string) {
    super("This change is still being saved.");
  }
}

type Prepared = { outcome: Outcome } | { source: CaptureSource };

const unavailable = failure(
  "provider_unavailable",
  "Couldn't reach MusicBrainz. Try again, or enter the details manually.",
);

/**
 * Saved albums under a release group MusicBrainz merged into `facts`' (TS-44), each with its own facts, which
 * answer under the new id. Only asked when the owner has no album of that release group already.
 */
async function mergeMatches(
  db: Database,
  { describe }: CaptureDeps,
  ownerId: string,
  facts: FoundFacts,
): Promise<{ albumId: string; facts: FoundFacts }[]> {
  if ((await savedAlbumsOf(db, ownerId, [facts.releaseGroupId])).size > 0) return [];
  const title = facts.values.title?.value;
  const artistCredit = facts.values.artistCredit?.value;
  if (!title || !artistCredit) return [];
  const candidates = await mergeCandidates(db, ownerId, {
    releaseGroupId: facts.releaseGroupId,
    title,
    artistCredit,
  });
  // MusicBrainz's queue paces these, one a second; each is kept 7 days.
  const answers = await Promise.all(
    candidates.map(async (candidate) => ({
      albumId: candidate.albumId,
      facts: await describe(candidate.releaseGroupId),
    })),
  );
  return answers.flatMap((answer) =>
    answer.facts.status === "found" && answer.facts.releaseGroupId === facts.releaseGroupId
      ? [{ albumId: answer.albumId, facts: answer.facts }]
      : [],
  );
}

/**
 * What a capture saves from, or the answer it gets before the lock (design decision 3): a failure, a choice between
 * albums, or a request for the album's details. A resubmitted choice is used only when the link still offers it.
 */
export async function prepareCapture(
  db: Database,
  deps: CaptureDeps,
  principal: Principal,
  args: CaptureArgs,
): Promise<Prepared> {
  const ownerId = actingUserId(principal);
  if (!ownerId) return { outcome: failure("permission_denied", "You can't add albums here.") };
  try {
    const identification = await deps.identify(args.link, {
      agent: principal.kind === "mcp",
      linked: (service, entityId) => findLinkedAlbum(db, ownerId, service, entityId),
    });
    if (identification.status === "failed") return { outcome: identification.failure };
    const { link: parsed } = identification;
    const link = { service: parsed.service, url: parsed.url, entityId: linkEntityId(parsed) };
    const details = args.details ? { details: args.details } : {};

    const identified = async (releaseGroupId: string): Promise<Prepared> => {
      const facts = await deps.describe(releaseGroupId);
      if (facts.status === "deleted") {
        return args.details
          ? { source: { kind: "entered", link, details: args.details } }
          : {
              outcome: {
                status: "needs_input",
                need: "details",
                candidates: [
                  { service: link.service, url: link.url, reason: unidentifiedReasons.notFound },
                ],
              },
            };
      }
      const merged = await mergeMatches(db, deps, ownerId, facts);
      return { source: { kind: "identified", link, facts, merged, ...details } };
    };

    if (identification.status === "linked") {
      return { source: { kind: "linked", link, albumId: identification.albumId } };
    }
    if (identification.status === "identified")
      return await identified(identification.releaseGroupId);
    if (identification.status === "ambiguous") {
      const { candidates } = identification;
      const chosen = candidates.find(
        (candidate) => candidate.releaseGroupId === args.releaseGroupId,
      );
      if (chosen) return await identified(chosen.releaseGroupId);
      if (args.details) return { source: { kind: "entered", link, details: args.details } };
      const saved = await savedAlbumsOf(
        db,
        ownerId,
        candidates.map((candidate) => candidate.releaseGroupId),
      );
      return {
        outcome: {
          status: "needs_input",
          need: "match",
          candidates: candidates.map(({ releaseGroupId, title }) => ({
            releaseGroupId,
            title,
            albumId: saved.get(releaseGroupId) ?? null,
          })),
        },
      };
    }
    if (args.details) {
      const prefill = identification.prefill ? { prefill: identification.prefill } : {};
      return { source: { kind: "entered", link, details: args.details, ...prefill } };
    }
    const outcome = identificationOutcome(identification);
    if (!outcome) throw new Error("An unidentified link always has an outcome");
    return { outcome };
  } catch (error) {
    if (error instanceof ProviderUnavailableError) return { outcome: unavailable };
    throw error;
  }
}

/**
 * Runs a mutation as the API does: a capture claimed, prepared and then saved; anything else by `executeMutation`.
 * Throws `MutationInProgressError` while another request runs the same capture.
 */
export function mutationRunner(db: Database, deps: CaptureDeps | undefined) {
  return async function run(
    principal: Principal,
    mutation: Mutation,
    now?: Date,
  ): Promise<ExecutedMutation> {
    if (mutation.name !== "album.capture") return executeMutation(db, principal, mutation, now);
    const claim = await claimMutation(db, principal, mutation, now);
    if (claim.status === "answered") return claim.executed;
    if (claim.status === "in_progress") throw new MutationInProgressError(mutation.mutationId);
    try {
      const prepared = deps
        ? await prepareCapture(db, deps, principal, mutation.args)
        : { outcome: unavailable };
      if ("outcome" in prepared) {
        return await finishMutation(db, principal, mutation, prepared.outcome, now);
      }
      return await executeMutation(db, principal, mutation, now, {
        claimed: true,
        capture: prepared.source,
      });
    } catch (error) {
      // An unexpected failure leaves nothing claimed, so sending it again runs it.
      await releaseClaim(db, principal, mutation.mutationId);
      throw error;
    }
  };
}

export type MutationRunner = ReturnType<typeof mutationRunner>;
