// Capture in the API (TS-22, TS-41, TS-44): `album.capture` asks its providers before it takes the owner's write lock.
// A capture is claimed first, so a copy sent while it runs answers `409 in_progress` and nothing runs twice. Then the
// link is identified, MusicBrainz is asked about its album and about saved albums it may have merged, and the domain
// command matches and saves under the lock. Answers decided before the lock, such as a choice to make, are stored
// like any outcome. A link edit's URL is read before the lock too (TON-46). Every other mutation runs as it always
// has.

import {
  capturesSince,
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
  maxCapturesPerHour,
  linkEntityId,
  type AlbumFacts,
  type CaptureArgs,
  type CaptureSource,
  type EmailPort,
  type FoundFacts,
  type Mutation,
  type Outcome,
  type PreparedLink,
  type Principal,
  shareToken,
  shareTokenHash,
} from "@tonaris/domain";
import {
  identificationOutcome,
  ProviderUnavailableError,
  readLink,
  safeFetch,
  unidentifiedReasons,
  type Identifier,
  type LinkParse,
} from "@tonaris/providers";

import { deliverInvitation } from "./invitations";

/**
 * What capture asks: the identification chain, and MusicBrainz's facts about a release group. `readLink` reads a link
 * edit's URL (TON-46), following a short link through `safeFetch` unless a test stubs it.
 */
export type CaptureDeps = {
  identify: Identifier["identify"];
  describe: (releaseGroupId: string) => Promise<AlbumFacts>;
  readLink?: (input: string) => Promise<Exclude<LinkParse, { status: "short" }>>;
};

/** Thrown when a mutation is claimed by another request that is still running it (TS-22). */
export class MutationInProgressError extends Error {
  constructor(readonly mutationId: string) {
    super("This change is still being saved.");
  }
}

type Prepared = { outcome: Outcome } | { source: CaptureSource };

const tooManyCaptures = failure(
  "rate_limited",
  `You've added ${maxCapturesPerHour} albums from links in the last hour. Try again later, or enter an album manually.`,
);

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
 * A `link.set`'s URL as the command needs it (TON-46, TS-40): read, a short link followed, and its canonical URL with
 * `linkEntityId()`; or why it couldn't be read. Nothing is written, so this runs before the lock.
 */
export async function prepareLink(
  input: string,
  read: NonNullable<CaptureDeps["readLink"]> = (text) => readLink(text, safeFetch),
): Promise<PreparedLink> {
  const parsed = await read(input);
  if (parsed.status === "failed") return parsed;
  const { link } = parsed;
  return {
    status: "parsed",
    link: { service: link.service, url: link.url, entityId: linkEntityId(link) },
  };
}

/**
 * Runs a mutation as the API does: a capture claimed, prepared and then saved; a link edit with its URL read first;
 * anything else by `executeMutation`. Throws `MutationInProgressError` while another request runs the same capture.
 */
export type SharingDeps = {
  /** Derives link tokens (TS-32). */
  shareSecret: string;
  /** Sends invitations (TS-72), with the web app's origin for their links. */
  email: EmailPort;
  webOrigin: string;
  logError: (error: unknown, context: string) => void;
};

export function mutationRunner(db: Database, deps: CaptureDeps | undefined, sharing: SharingDeps) {
  const run = runMutation(db, deps, sharing);
  return async function runAndDeliver(
    principal: Principal,
    mutation: Mutation,
    now?: Date,
  ): Promise<ExecutedMutation> {
    const executed = await run(principal, mutation, now);
    // A saved invitation's email goes out after the response; a replay never sends again (FR-07.5).
    const { outcome } = executed.result;
    if (
      (mutation.name === "share.invite" || mutation.name === "share.resendInvitation") &&
      !executed.replayed &&
      outcome.status === "confirmed" &&
      typeof outcome.result === "object" &&
      outcome.result !== null &&
      "emailing" in outcome.result &&
      outcome.result.emailing === true &&
      "grantId" in outcome.result &&
      typeof outcome.result.grantId === "string"
    ) {
      void deliverInvitation(
        { db, email: sharing.email, webOrigin: sharing.webOrigin },
        outcome.result.grantId,
      ).catch((error: unknown) => sharing.logError(error, "invitation email"));
    }
    return executed;
  };
}

function runMutation(
  db: Database,
  deps: CaptureDeps | undefined,
  { shareSecret }: Pick<SharingDeps, "shareSecret">,
) {
  return async function run(
    principal: Principal,
    mutation: Mutation,
    now?: Date,
  ): Promise<ExecutedMutation> {
    // A new link's token is derived with the server's secret, which commands never see: its hash goes in (TS-32).
    if (mutation.name === "share.setLink" && mutation.args.enabled) {
      const hash = await shareTokenHash(await shareToken(shareSecret, mutation.args.linkId));
      return executeMutation(db, principal, mutation, now, { shareLink: { hash } });
    }
    if (mutation.name === "link.set") {
      const link = await prepareLink(mutation.args.url, deps?.readLink);
      return executeMutation(db, principal, mutation, now, { link });
    }
    if (mutation.name !== "album.capture") return executeMutation(db, principal, mutation, now);
    const claim = await claimMutation(db, principal, mutation, now);
    if (claim.status === "answered") return claim.executed;
    if (claim.status === "in_progress") throw new MutationInProgressError(mutation.mutationId);
    // At most 100 captures an hour, from the app or MCP (TS-18), refused before any provider is asked.
    const ownerId = actingUserId(principal);
    const at = now ?? new Date();
    if (
      ownerId &&
      (await capturesSince(db, ownerId, new Date(at.getTime() - 3_600_000), mutation.mutationId)) >=
        maxCapturesPerHour
    ) {
      return finishMutation(db, principal, mutation, tooManyCaptures, now);
    }
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
