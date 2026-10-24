// What MusicBrainz says about an album, for enrichment (TS-41, TS-42): the release group's title, artist credit and
// first year (FR-02.12), its classification (TS-45), a live album's recording years (TS-46), and its front on the
// Cover Art Archive. A merged release group answers under its new id, and a deleted one answers 404 (TS-44).
// Every value carries its source and the MBID it was read from (TS-15).

import { z } from "zod";

import type {
  AlbumFacts,
  AlbumFields,
  EnrichableField,
  EnrichableFields,
  ProvenanceSource,
  SourcedValues,
} from "@tonaris/domain";

import type { MusicBrainz } from "./musicbrainz";
import { policy } from "./policy";
import { ProviderUnavailableError } from "./provider-cache";

const releaseGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  "primary-type": z.string().nullish(),
  "secondary-types": z.array(z.string()).nullish(),
  "first-release-date": z.string().nullish(),
  "artist-credit": z
    .array(z.object({ name: z.string(), joinphrase: z.string().nullish() }))
    .nullish(),
  releases: z
    .array(z.object({ id: z.string(), status: z.string().nullish(), date: z.string().nullish() }))
    .nullish(),
});

const datesSchema = z.object({ begin: z.string().nullish(), end: z.string().nullish() });
const releaseSchema = z.object({
  media: z
    .array(
      z.object({
        tracks: z
          .array(
            z.object({
              recording: z.object({
                relations: z
                  .array(
                    datesSchema.extend({
                      type: z.string(),
                      event: z.object({ "life-span": datesSchema.nullish() }).nullish(),
                    }),
                  )
                  .nullish(),
              }),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});

/** What the release group lookup includes: its artist credit, and its releases, which come by date (25 at most). */
const releaseGroupIncludes = ["artist-credits", "releases"] as const;
/** What a live album's release lookup includes: its recordings, with their place, area and event relationships. */
const recordingIncludes = [
  "recordings",
  "recording-level-rels",
  "place-rels",
  "area-rels",
  "event-rels",
] as const;
/** The relationships that date a recording (TS-46). */
const recordingTypes = new Set(["recorded at", "recorded in"]);

type ReleaseType = NonNullable<AlbumFields["releaseType"]>;

/** A classification; a part MusicBrainz leaves unknown is absent. */
export type Classification = { releaseType?: ReleaseType; isLive?: boolean };

/**
 * TS-45, as decided on 24 October 2026: Album and EP map to themselves, and Compilation among the secondary types
 * makes either a compilation, as it does a release group with no primary type; Live makes them live. Single,
 * Broadcast and Other, and any type MusicBrainz adds later, are Unclassified and not live, whatever their secondary
 * types, so a live single isn't Live (FR-05.9).
 */
export function classify(
  primaryType: string | null | undefined,
  secondaryTypes: readonly string[],
): Classification {
  const compilation = secondaryTypes.includes("Compilation");
  const live = secondaryTypes.includes("Live");
  if (primaryType === "Album" || primaryType === "EP") {
    return {
      releaseType: compilation ? "compilation" : primaryType === "EP" ? "ep" : "album",
      isLive: live,
    };
  }
  if (primaryType === null || primaryType === undefined) {
    return {
      ...(compilation ? { releaseType: "compilation" as const } : {}),
      ...(live ? { isLive: true } : {}),
    };
  }
  return { isLive: false };
}

/** The year of a MusicBrainz date (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), if it has one. */
function yearOf(date: string | null | undefined): number | undefined {
  const year = Number(/^(\d{4})/.exec(date ?? "")?.[1]);
  return year >= 1 ? year : undefined;
}

/**
 * TS-46: the years a release's recordings span, from the dates of their "recorded at" and "recorded in"
 * relationships. A recording none of whose relationships is dated uses the `life-span` of the events it was
 * recorded at. A single year spans from itself to itself; no dated recording means no span.
 */
export function recordingYears(release: unknown): { start: number; end: number } | undefined {
  const years: number[] = [];
  for (const medium of releaseSchema.parse(release).media ?? []) {
    for (const { recording } of medium.tracks ?? []) {
      const relations = (recording.relations ?? []).filter((relation) =>
        recordingTypes.has(relation.type),
      );
      const own = relations.flatMap((relation) => [relation.begin, relation.end]);
      const events = relations.flatMap((relation) => [
        relation.event?.["life-span"]?.begin,
        relation.event?.["life-span"]?.end,
      ]);
      const dated = own.flatMap((date) => yearOf(date) ?? []);
      years.push(...(dated.length > 0 ? dated : events.flatMap((date) => yearOf(date) ?? [])));
    }
  }
  if (years.length === 0) return undefined;
  return { start: Math.min(...years), end: Math.max(...years) };
}

/** A release's date for ordering, by code point: "1986" comes before "1986-09-17", and undated releases go last. */
const dateKey = (release: { date?: string | null }) => release.date || "~";

/** The release a live album's recordings are read from: its first official release by date, else its first. */
function originalRelease(
  releases: readonly { id: string; status?: string | null; date?: string | null }[],
): string | undefined {
  const byDate = releases.toSorted((a, b) =>
    dateKey(a) < dateKey(b) ? -1 : dateKey(a) > dateKey(b) ? 1 : 0,
  );
  return (byDate.find((release) => release.status === "Official") ?? byDate[0])?.id;
}

/** The release group's front, or none when the Cover Art Archive has none or can't be asked (FR-03.4). */
async function front(musicBrainz: MusicBrainz, releaseGroupId: string): Promise<string | null> {
  try {
    return await musicBrainz.releaseGroupFront(releaseGroupId);
  } catch (error) {
    if (error instanceof ProviderUnavailableError && error.provider === "coverartarchive")
      return null;
    throw error;
  }
}

/**
 * What MusicBrainz says about the release group `releaseGroupId`. Asks for the release group, then, for a live
 * album only, for its original release's recordings; both lookups are kept 7 days. MusicBrainz's unavailability
 * propagates as `ProviderUnavailableError`, so the capture's job retries (TS-90); the Cover Art Archive's leaves
 * the artwork out.
 */
export async function describeAlbum(
  musicBrainz: MusicBrainz,
  releaseGroupId: string,
): Promise<AlbumFacts> {
  const body = await musicBrainz.lookup("release-group", releaseGroupId, releaseGroupIncludes);
  if (body === null) return { status: "deleted", askedId: releaseGroupId };
  const group = releaseGroupSchema.parse(body);
  const values: SourcedValues = {};
  /** Keeps a value read from `ref`, if its source's policy lets Tonaris store it (TS-15). */
  function keep<F extends EnrichableField>(
    field: F,
    value: NonNullable<EnrichableFields[F]>,
    { source = "musicbrainz", ref = group.id }: { source?: ProvenanceSource; ref?: string } = {},
  ): void {
    // The signature ties the value to its field's type.
    if (policy[source].store) Object.assign(values, { [field]: { value, source, ref } });
  }

  const title = group.title.trim();
  if (title !== "") keep("title", title);
  const artistCredit = (group["artist-credit"] ?? [])
    .map((credit) => credit.name + (credit.joinphrase ?? ""))
    .join("")
    .trim();
  if (artistCredit !== "") keep("artistCredit", artistCredit);
  const { releaseType, isLive } = classify(group["primary-type"], group["secondary-types"] ?? []);
  if (releaseType) keep("releaseType", releaseType);
  if (isLive !== undefined) keep("isLive", isLive);
  const originalYear = yearOf(group["first-release-date"]);
  if (originalYear) keep("originalYear", originalYear);

  if (isLive) {
    const releaseId = originalRelease(group.releases ?? []);
    const release =
      releaseId === undefined
        ? null
        : await musicBrainz.lookup("release", releaseId, recordingIncludes);
    const years = release === null ? undefined : recordingYears(release);
    if (years && releaseId !== undefined) {
      keep("recordingYearStart", years.start, { ref: releaseId });
      keep("recordingYearEnd", years.end, { ref: releaseId });
    }
  }

  const artworkUrl = await front(musicBrainz, group.id);
  if (artworkUrl) keep("artworkUrl", artworkUrl, { source: "coverartarchive" });
  return {
    status: "found",
    askedId: releaseGroupId,
    releaseGroupId: group.id,
    values,
  };
}
