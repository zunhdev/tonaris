// Capture (FR-02.1–FR-02.3, FR-02.9, FR-02.10, FR-14.4, TS-44): saving the album a pasted link names. The API
// identifies the link and asks MusicBrainz outside the owner's write lock, and hands this command what it found.
// The command then matches and saves under the lock, against the collection as it is at that moment:
// - the same link, the same release group, or one MusicBrainz merged into it is the same album, in Trash or not.
//   An active album wins over a trashed one (FR-14.3); similarity alone never makes two albums one;
// - a trashed match is reactivated with only the requested list (FR-14.4, TS-13);
// - otherwise a new album is created, from MusicBrainz's values or the person's details. One missing its year asks
//   for the details instead (FR-02.6).
// Gaps are filled (TS-42), the link is saved unless the album has another for its service (FR-06.4), and the album
// joins the list asked for, at most once (FR-01.7).

import {
  albumFields,
  albumFieldsSchema,
  albumProblem,
  type Album,
  type AlbumFields,
} from "./albums";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import {
  blankAlbum,
  planEnrichment,
  type AlbumFacts,
  type EnrichableAlbum,
  type EnrichmentPlan,
  type ProvenanceEntry,
  type ProvenanceSource,
  type SourcedValues,
} from "./enrichment";
import { maxLinkLength, maxMemberships } from "./limits";
import { streamingServices, type StreamingService } from "./links";
import { addMembership, membershipKey } from "./memberships";
import { failure, type Outcome } from "./outcomes";
import { authorizeWrite } from "./policies";
import { forgetPlace, placeAtTop } from "./positions";
import { actingUserId } from "./principals";
import { serviceLinkKey } from "./service-links";
import { z } from "./zod";

/** `album.capture`'s arguments. A capture needing input is resubmitted with the person's choice (TS-26). */
export const captureArgsSchema = z.object({
  albumId: z.uuid({ version: "v7" }).meta({
    description: "The ID a new album gets (TS-10). A reused album keeps its own.",
  }),
  link: z.string().min(1).max(maxLinkLength).meta({ description: "The link as pasted (FR-02.1)." }),
  listId: z.uuid().nullable().meta({
    description: "The list to put the album in, or null for none: Unsorted (FR-02.2).",
  }),
  releaseGroupId: z.uuid().optional().meta({
    description: "The person's choice among a `match` answer's candidates (TS-26).",
  }),
  details: albumFieldsSchema.optional().meta({
    description: "The album's details from the person, after a `details` answer (FR-02.4).",
  }),
});
export type CaptureArgs = z.infer<typeof captureArgsSchema>;

/** Whether the captured album is new, the owner's already, or theirs brought back from Trash. */
export const captureMatches = ["created", "reused", "restored"] as const;

/** `album.capture`'s `result` in a `confirmed` outcome: what DS-48's toasts report. */
export const captureResultSchema = z
  .object({
    albumId: z.uuid(),
    match: z.enum(captureMatches),
    alreadyInList: z.boolean().meta({
      description: "The album was already in the list: its entry was kept unchanged (FR-01.7).",
    }),
    keptLink: z
      .object({ service: z.enum(streamingServices), kept: z.string(), pasted: z.string() })
      .nullable()
      .meta({
        description:
          "The album's link for the pasted link's service, kept instead of the pasted one (FR-06.4).",
      }),
  })
  .meta({ description: "What `album.capture` reports (FR-02.9, FR-14.4, FR-06.4)." });
export type CaptureResult = z.infer<typeof captureResultSchema>;

/** A link as an album keeps it (TS-11): its canonical URL, and `linkEntityId()`. */
export type CapturedLink = { service: StreamingService; url: string; entityId: string };

/** Values to prefill manual entry with, and where they came from (FR-02.4, TS-41). */
export type CapturePrefill = {
  source: Extract<ProvenanceSource, "musicbrainz" | "itunes-lookup">;
  values: Partial<AlbumFields>;
};

export type FoundFacts = Extract<AlbumFacts, { status: "found" }>;

/** What the API found before the lock: the album a link names, or what the person entered for it. */
export type CaptureSource = { link: CapturedLink } &
  /** TS-41 step 1: an album of the owner's has the link. */
  (
    | { kind: "linked"; albumId: string }
    /** A MusicBrainz album, with saved albums whose release group MusicBrainz merged into it (TS-44). */
    | {
        kind: "identified";
        facts: FoundFacts;
        merged: { albumId: string; facts: FoundFacts }[];
        details?: AlbumFields;
      }
    /** No MusicBrainz album: the person's details, and what manual entry was prefilled with. */
    | { kind: "entered"; details: AlbumFields; prefill?: CapturePrefill }
  );

/** An album as capture sees it: its values and identity, its owner, and whether it is in Trash. */
export type CaptureTarget = EnrichableAlbum & { id: string; ownerId: string; trashed: boolean };

/** Where a new album's values came from, for its provenance (TS-15). */
export type AlbumOrigin = {
  releaseGroupId: string | null;
  artworkUrl: string | null;
  provenance: ProvenanceEntry[];
};

/** Why a captured album asks for its details (DS-48). */
export const missingYearReason =
  "MusicBrainz doesn't know when this album first came out. Enter its year; the link is kept.";

const { artworkUrl: _artwork, releaseGroupId: _releaseGroup, ...blankFields } = blankAlbum;

const applied = (changes: ChangeInput[], result: CaptureResult): CommandResult => ({
  status: "applied",
  changes,
  result,
});

/** The album as clients hold it. */
const clientAlbum = (id: string, values: AlbumFields): Album => ({
  id,
  title: values.title,
  artistCredit: values.artistCredit,
  releaseType: values.releaseType,
  isLive: values.isLive,
  originalYear: values.originalYear,
  recordingYearStart: values.recordingYearStart,
  recordingYearEnd: values.recordingYearEnd,
});

/**
 * Each of the person's values with its source (TS-15, TS-41): the offering source's when they left it as offered,
 * else theirs.
 */
function detailsProvenance(
  details: AlbumFields,
  offered: SourcedValues | CapturePrefill | undefined,
  now: Date,
): ProvenanceEntry[] {
  return albumFields.flatMap((field): ProvenanceEntry[] => {
    const value = details[field];
    if (value === null) return [];
    if (offered && "source" in offered) {
      return offered.values[field] === value
        ? [{ field, source: offered.source, sourceRef: null, retrievedAt: now }]
        : [{ field, source: "user", sourceRef: null, retrievedAt: null }];
    }
    const found = offered?.[field];
    return found?.value === value
      ? [{ field, source: found.source, sourceRef: found.ref, retrievedAt: now }]
      : [{ field, source: "user", sourceRef: null, retrievedAt: null }];
  });
}

/** The answer asking for the album's details, prefilled, with the link kept (FR-02.4, FR-02.6). */
function askForDetails(
  link: CapturedLink,
  prefill: CapturePrefill,
): Extract<Outcome, { status: "needs_input" }> {
  return {
    status: "needs_input",
    need: "details",
    candidates: [{ service: link.service, url: link.url, reason: missingYearReason, prefill }],
  };
}

/**
 * The owner's album the source names, with the facts to enrich it from: the linked album; else one saved as the
 * release group, active first; else a merge match, active first, still saved as it was when MusicBrainz was asked.
 */
async function matchOf(
  ownerId: string,
  source: CaptureSource,
  { store }: CommandContext,
): Promise<{ target: CaptureTarget; facts?: FoundFacts } | undefined> {
  if (source.kind === "entered") return undefined;
  if (source.kind === "linked") {
    const target = await store.findCaptureTarget(source.albumId);
    return target?.ownerId === ownerId ? { target } : undefined;
  }
  const { facts } = source;
  const [saved] = await store.albumsOfReleaseGroup(ownerId, facts.releaseGroupId);
  if (saved) return { target: saved, facts };
  const merged = (
    await Promise.all(
      source.merged.map(async (match) => ({
        target: await store.findCaptureTarget(match.albumId),
        facts: match.facts,
      })),
    )
  ).flatMap(({ target, facts: own }) =>
    target?.ownerId === ownerId && target.releaseGroupId === own.askedId
      ? [{ target, facts: own }]
      : [],
  );
  return merged.find((match) => !match.target.trashed) ?? merged[0];
}

/** The change that tells clients an album has `link` (TON-46). */
const linkInsert = (albumId: string, link: CapturedLink): ChangeInput => ({
  entity: "link",
  id: serviceLinkKey(albumId, link.service),
  op: "insert",
  data: { albumId, service: link.service, url: link.url },
});

/** Saves the link unless the album has another for its service, which is kept and reported (FR-06.4). */
async function keepLink(
  albumId: string,
  ownerId: string,
  link: CapturedLink,
  { store }: CommandContext,
): Promise<{ keptLink: CaptureResult["keptLink"]; changes: ChangeInput[] }> {
  const saved = await store.findServiceLink(albumId, link.service);
  if (!saved) {
    await store.insertServiceLink(albumId, ownerId, link);
    return { keptLink: null, changes: [linkInsert(albumId, link)] };
  }
  return {
    keptLink:
      saved.entityId === link.entityId
        ? null
        : { service: link.service, kept: saved.url, pasted: link.url },
    changes: [],
  };
}

/** Puts the album in the list asked for, or, with none, at the top of Unsorted when it enters it (DS-51). */
async function place(
  albumId: string,
  ownerId: string,
  listId: string | null,
  enteringUnsorted: boolean,
  context: CommandContext,
): Promise<{ changes: ChangeInput[]; alreadyInList: boolean }> {
  if (listId !== null) {
    // The destination and the entry limit were checked before anything was written.
    const added = await addMembership({ listId, albumId }, context);
    if (added.status !== "applied") throw new Error(`The checked entry failed: ${added.status}`);
    const { result } = added;
    const alreadyInList =
      typeof result === "object" && result !== null && "alreadyInList" in result
        ? result.alreadyInList === true
        : false;
    return { changes: added.changes, alreadyInList };
  }
  const { store } = context;
  const arranged = (await store.firstKey(ownerId, "unsorted")) !== undefined;
  return {
    changes:
      enteringUnsorted && arranged ? [await placeAtTop(store, ownerId, "unsorted", albumId)] : [],
    alreadyInList: false,
  };
}

/** The refusal when a new entry would pass the account's limit (TS-18), checked before anything is written. */
async function entryLimit(
  listId: string | null,
  ownerId: string,
  albumId: string | undefined,
  { store }: CommandContext,
): Promise<CommandResult | undefined> {
  if (listId === null) return undefined;
  if (albumId !== undefined && (await store.findMembership(listId, albumId))) return undefined;
  if ((await store.countMemberships(ownerId)) < maxMemberships) return undefined;
  return failure(
    "limit_exceeded",
    `You've reached ${maxMemberships.toLocaleString("en")} list entries (including Trash). Remove albums from lists, or permanently delete lists from Trash, to add more.`,
  );
}

/** Whether the plan fills a value clients hold. */
const fillsClientValues = (plan: EnrichmentPlan) =>
  albumFields.some((field) => plan.values[field] !== undefined);

async function reuse(
  args: CaptureArgs,
  ownerId: string,
  link: CapturedLink,
  { target, facts }: { target: CaptureTarget; facts?: FoundFacts },
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const changes: ChangeInput[] = [];
  const restored = target.trashed;
  if (restored) {
    const left = await store.reactivateAlbum(target.id);
    const places = await Promise.all(
      left.map((listId) => forgetPlace(store, ownerId, listId, target.id)),
    );
    changes.push(
      ...left.map((listId): ChangeInput => ({
        entity: "membership",
        id: membershipKey(listId, target.id),
        op: "delete",
        data: null,
      })),
      ...places.flat(),
    );
  }
  if (facts) {
    const plan = planEnrichment(target, facts, context.now);
    if (Object.keys(plan.values).length > 0 || plan.releaseGroupId !== undefined) {
      await store.fillAlbum(target.id, plan);
    }
    if (fillsClientValues(plan)) {
      changes.push({
        entity: "album",
        id: target.id,
        op: "update",
        data: clientAlbum(target.id, { ...target, ...plan.values }),
      });
    }
  }
  const { keptLink, changes: linked } = await keepLink(target.id, ownerId, link, context);
  const placed = await place(target.id, ownerId, args.listId, restored, context);
  return applied([...changes, ...linked, ...placed.changes], {
    albumId: target.id,
    match: restored ? "restored" : "reused",
    alreadyInList: placed.alreadyInList,
    keptLink,
  });
}

async function create(
  args: CaptureArgs,
  ownerId: string,
  source: Extract<CaptureSource, { kind: "identified" | "entered" }>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const now = context.now ?? new Date();
  if (await store.findAlbum(args.albumId)) {
    return failure("validation_failed", "This album ID is already in use.", [
      { path: "args.albumId", message: "Already in use" },
    ]);
  }

  let values: AlbumFields;
  let origin: AlbumOrigin;
  if (source.kind === "identified") {
    const plan = planEnrichment(blankAlbum, source.facts, now);
    const { artworkUrl = null, ...planned } = plan.values;
    const artwork = plan.provenance.filter((entry) => entry.field === "artworkUrl");
    if (source.details) {
      values = source.details;
      origin = {
        releaseGroupId: source.facts.releaseGroupId,
        artworkUrl,
        provenance: [...detailsProvenance(values, source.facts.values, now), ...artwork],
      };
    } else {
      values = { ...blankFields, ...planned };
      if (albumProblem(values)) {
        return askForDetails(source.link, { source: "musicbrainz", values: planned });
      }
      origin = {
        releaseGroupId: source.facts.releaseGroupId,
        artworkUrl,
        provenance: plan.provenance,
      };
    }
  } else {
    values = source.details;
    origin = {
      releaseGroupId: null,
      artworkUrl: null,
      provenance: detailsProvenance(values, source.prefill, now),
    };
  }
  const problem = albumProblem(values);
  if (problem) return problem;

  const album = clientAlbum(args.albumId, values);
  await store.insertAlbum({ ...album, ownerId }, origin);
  await store.insertServiceLink(args.albumId, ownerId, source.link);
  const placed = await place(args.albumId, ownerId, args.listId, true, context);
  return applied(
    [
      { entity: "album", id: args.albumId, op: "insert", data: album },
      linkInsert(args.albumId, source.link),
      ...placed.changes,
    ],
    {
      albumId: args.albumId,
      match: "created",
      alreadyInList: false,
      keptLink: null,
    },
  );
}

/**
 * `album.capture` (FR-02.1, FR-02.9, FR-14.4): saves the album `source` names, as the API prepared it from the link.
 * Everything that can refuse is checked before anything is written, so a refusal changes nothing (X-05).
 */
export async function captureAlbum(
  args: CaptureArgs,
  source: CaptureSource | undefined,
  context: CommandContext,
): Promise<CommandResult> {
  const { principal, store } = context;
  if (!source) {
    return failure(
      "provider_unavailable",
      "Tonaris can't look links up right now. Try again, or enter the details manually.",
    );
  }
  const ownerId = actingUserId(principal);
  const decision = authorizeWrite(principal, { ownerId: ownerId ?? "", scope: "collection" });
  if (!ownerId || !decision.allowed) {
    return failure(
      decision.allowed ? "permission_denied" : decision.code,
      "You can't add albums here.",
    );
  }
  if (args.listId !== null) {
    const list = await store.findContainer(args.listId);
    if (!list || list.ownerId !== ownerId) return failure("not_found", "This list doesn't exist.");
    if (list.kind !== "list") {
      return failure("invalid_destination", "Folders don't hold albums. Choose a list.");
    }
    if (list.trashed) {
      return failure("trashed", "This list is in Trash. Recover it to add albums to it.");
    }
  }

  const match = await matchOf(ownerId, source, context);
  const refusal = await entryLimit(args.listId, ownerId, match?.target.id, context);
  if (match) return refusal ?? reuse(args, ownerId, source.link, match, context);
  if (source.kind === "linked") {
    return failure("not_found", "The album with this link is gone. Try adding it again.");
  }
  return refusal ?? create(args, ownerId, source, context);
}
