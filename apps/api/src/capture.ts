// Capture in the API (TS-22, TS-41, TS-44): `album.capture` asks its providers before it takes the owner's write lock.
// The mutation runner claims the capture first (sync/runner.ts). Then the link is identified, MusicBrainz is asked
// about its album and about saved albums it may have merged, and the domain command matches and saves under the lock.
// Answers decided before the lock, such as a choice to make, are stored like any outcome. A link edit's URL is read
// before the lock too (TON-46).

import {
  albumsSeenBy,
  captureOwnerOf,
  agreedToTerms,
  findLinkedAlbum,
  mergeCandidates,
  savedAlbumsOf,
  type Database,
} from "@tonaris/db";
import {
  actingUserId,
  failure,
  linkEntityId,
  type AlbumFacts,
  type CaptureArgs,
  type CaptureDetailsCandidate,
  type CaptureMatchCandidate,
  type CaptureSource,
  type FoundFacts,
  type Outcome,
  type PreparedLink,
  type Principal,
  termsVersion,
} from "@tonaris/domain";
import {
  identificationOutcome,
  ProviderUnavailableError,
  readLink,
  safeFetch,
  unidentifiedReasons,
  type Identifier,
  unavailableFailure,
  type LinkParse,
} from "@tonaris/providers";

/**
 * What capture asks: the identification chain, and MusicBrainz's facts about a release group. `readLink` reads a link
 * edit's URL (TON-46), following a short link through `safeFetch` unless a test stubs it.
 */
export type CaptureDeps = {
  identify: Identifier["identify"];
  describe: (releaseGroupId: string) => Promise<AlbumFacts>;
  /** Step 4's rule on an agent's details for an unidentified link (TON-111); without it, they're saved as entered. */
  matchDetails?: Identifier["matchDetails"];
  readLink?: (input: string) => Promise<Exclude<LinkParse, { status: "short" }>>;
};

type Prepared = { outcome: Outcome } | { source: CaptureSource };

const unavailable = unavailableFailure({ provider: "musicbrainz" });

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
 * Without `deps`, nothing can be asked, so it fails as `provider_unavailable`.
 */
export async function prepareCapture(
  db: Database,
  deps: CaptureDeps | undefined,
  principal: Principal,
  args: CaptureArgs,
): Promise<Prepared> {
  if (!deps) return { outcome: unavailable };
  const userId = actingUserId(principal);
  if (!userId) return { outcome: failure("permission_denied", "You can't add albums here.") };
  // Matched against the collection it saves to: an editor's capture into a share, the owner's (FR-07.19). A list it
  // can't save to refuses here, by the command's rule, before the link is looked up (DRIFT-019).
  const ownerId = await captureOwnerOf(db, principal, args.listId);
  if (typeof ownerId !== "string") return { outcome: ownerId };
  // An editor's capture never finds the owner's Trash, which is the owner's to restore from (FR-07.20).
  const editor = ownerId !== userId;
  try {
    const identification = await deps.identify(args.link, {
      agent: principal.kind === "mcp",
      linked: (service, entityId) =>
        findLinkedAlbum(db, ownerId, service, entityId, { activeOnly: editor }),
      // The person capturing agreed to YouTube's terms, or didn't (FR-11.14).
      mayReadYouTube: () => agreedToTerms(db, userId, termsVersion),
    });
    if (identification.status === "failed") return { outcome: identification.failure };
    const { link: parsed } = identification;
    const link = { service: parsed.service, url: parsed.url, entityId: linkEntityId(parsed) };
    const details = args.details ? { details: args.details } : {};

    const identified = async (releaseGroupId: string, matched = false): Promise<Prepared> => {
      const facts = await deps.describe(releaseGroupId);
      if (facts.status === "deleted") {
        return args.details
          ? { source: { kind: "entered", link, details: args.details } }
          : {
              outcome: {
                status: "needs_input",
                need: "details",
                candidates: [
                  {
                    service: link.service,
                    url: link.url,
                    reason: unidentifiedReasons.notFound,
                  } satisfies CaptureDetailsCandidate,
                ],
              },
            };
      }
      const merged = await mergeMatches(db, deps, ownerId, facts);
      return {
        source: {
          kind: "identified",
          link,
          facts,
          merged,
          ...details,
          ...(matched ? { matched: true as const } : {}),
        },
      };
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
      // An editor is shown only the albums they see already, never the owner's others: the command's rule, so a
      // candidate shown as new isn't then reported as reused (FR-07.20, DRIFT-019).
      if (editor) {
        const seen = await albumsSeenBy(db, userId, [...saved.values()]);
        for (const [releaseGroupId, albumId] of saved) {
          if (!seen.has(albumId)) saved.delete(releaseGroupId);
        }
      }
      return {
        outcome: {
          status: "needs_input",
          need: "match",
          candidates: candidates.map(({ releaseGroupId, title }): CaptureMatchCandidate => ({
            releaseGroupId,
            title,
            albumId: saved.get(releaseGroupId) ?? null,
          })),
        },
      };
    }
    if (args.details) {
      // An agent's details stand in for the store page its capture doesn't read (TON-111, FR-10.5). A person's
      // manual entry adds the album without a lookup (FR-02.4).
      const { originalYear } = args.details;
      const matched =
        principal.kind === "mcp" && deps.matchDetails && originalYear !== null
          ? await deps.matchDetails({ ...args.details, originalYear })
          : undefined;
      if (matched) return await identified(matched, true);
      const prefill = identification.prefill ? { prefill: identification.prefill } : {};
      return { source: { kind: "entered", link, details: args.details, ...prefill } };
    }
    const outcome = identificationOutcome(identification);
    if (!outcome) throw new Error("An unidentified link always has an outcome");
    return { outcome };
  } catch (error) {
    // The provider that couldn't answer, by name (DRIFT-114).
    if (error instanceof ProviderUnavailableError) return { outcome: unavailableFailure(error) };
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
