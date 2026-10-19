// Builds the TON-18 corpus from MusicBrainz:
// - the albums the G1 samples labelled (TON-14, TON-15, TON-16), and curated artists known for hard cases;
// - every release of those albums that has a streaming link, classified as an edition;
// - each artist's official albums and EPs that share a title, judged pair by pair.
//
//   bun tooling/src/spikes/g2-matching/build.ts
//
// It writes tooling/fixtures/g2-matching/corpus.json, and review.md listing the pairs to judge by hand (their
// answers go in verdicts.ts). MusicBrainz responses are cached in the gitignored cache/ folder there.

import path from "node:path";

import { z } from "zod";

import { looseKey } from "../g1-apple-hints/rules";
import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import {
  compareTracks,
  type Edition,
  editionKinds,
  judgePair,
  type PairJudgement,
  type ReleaseGroup,
  sameTitleGroups,
  streamingLink,
  titleKey,
} from "./corpus";
import { curatedArtists } from "./verdicts";

const fixtures = path.resolve(import.meta.dir, "../../../fixtures");
const out = path.join(fixtures, "g2-matching");
const variousArtists = "89ad4ac3-39f7-470e-963a-56509c546377";
/** Artists with more official albums than this, such as composers and orchestras, are left out. */
const maxGroups = 300;

const mb = new MusicBrainz({
  cacheDir: path.join(out, "cache"),
  minIntervalMs: 1_100,
  maxRetries: 8,
});

// The albums the G1 samples labelled or identified.
const labelsSchema = z.record(z.string(), z.object({ releaseGroupIds: z.array(z.string()) }));
const base = new Set<string>();
for (const file of ["g1-apple/labels.json", "g1-spotify/labels.json"]) {
  // oxlint-disable-next-line no-await-in-loop
  const labels = labelsSchema.parse(await Bun.file(path.join(fixtures, file)).json());
  for (const label of Object.values(labels)) for (const id of label.releaseGroupIds) base.add(id);
}
const ton14 = z
  .object({
    results: z.array(
      z.object({ release: z.object({ releaseGroupId: z.string().nullable() }).optional() }),
    ),
  })
  .parse(await Bun.file(path.join(fixtures, "g1-sample/results.json")).json());
for (const r of ton14.results) if (r.release?.releaseGroupId) base.add(r.release.releaseGroupId);

const releasesSchema = z.object({
  releases: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        disambiguation: z.string().optional(),
        date: z.string().optional(),
        country: z.string().nullish(),
        "artist-credit": z
          .array(z.object({ name: z.string(), artist: z.object({ id: z.string() }) }))
          .optional(),
        relations: z
          .array(
            z.object({
              "target-type": z.string(),
              url: z.object({ resource: z.string() }).optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
});
const groupsSchema = z.object({
  "release-group-count": z.number(),
  "release-groups": z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        "first-release-date": z.string().optional(),
        "primary-type": z.string().nullish(),
        "secondary-types": z.array(z.string()).optional(),
        disambiguation: z.string().optional(),
      }),
    )
    .default([]),
});

const editions: Edition[] = [];
const artistOf = new Map<string, { id: string; name: string }>();
/** Release groups MusicBrainz no longer has, such as a Wikidata label pointing at one merged away. */
const missing: string[] = [];

/** Every release of an album with a streaming link, as an edition; also notes the album's first artist. */
async function harvest(releaseGroupId: string) {
  const body = await mb.get("release", {
    "release-group": releaseGroupId,
    inc: "url-rels artist-credits",
    limit: "100",
  });
  if (body === null) {
    missing.push(releaseGroupId);
    return;
  }
  const { releases } = releasesSchema.parse(body);
  const dated = releases.filter((r) => r.date).toSorted((a, b) => (a.date! < b.date! ? -1 : 1));
  const first = dated[0] ?? releases[0];
  const credit = first?.["artist-credit"]?.[0];
  if (credit) artistOf.set(releaseGroupId, { id: credit.artist.id, name: credit.name });
  for (const release of releases) {
    const links = [
      ...new Set(
        (release.relations ?? []).flatMap((rel) => {
          const found = rel.url && streamingLink(rel.url.resource);
          return found ? [found.link] : [];
        }),
      ),
    ];
    if (links.length === 0) continue;
    const disambiguation = release.disambiguation ?? "";
    editions.push({
      releaseGroupId,
      releaseId: release.id,
      title: release.title,
      disambiguation,
      ...(release.date && { date: release.date }),
      ...(release.country && { country: release.country }),
      kinds: editionKinds(
        {
          title: release.title,
          disambiguation,
          date: release.date,
          country: release.country ?? undefined,
        },
        { date: first?.date, country: first?.country ?? undefined },
      ),
      links,
    });
  }
}

console.error(`Harvesting the editions of ${base.size} albums…`);
for (const id of base) {
  // Paced through MusicBrainz's 1 request/second queue.
  // oxlint-disable-next-line no-await-in-loop
  await harvest(id);
}

// Each artist's official albums and EPs.
const artists = new Map<string, { name: string; groups?: number; skipped?: string }>();
for (const { id, name } of artistOf.values()) if (id !== variousArtists) artists.set(id, { name });
for (const { id, name } of curatedArtists) artists.set(id, { name });

const releaseGroups: Record<string, ReleaseGroup & { artistId: string }> = {};
const titleGroups: { artistId: string; artist: string; members: ReleaseGroup[] }[] = [];
const sameTitle: {
  artistId: string;
  artist: string;
  key: string;
  members: string[];
  pairs: (PairJudgement & { a: string; b: string })[];
}[] = [];

console.error(`Listing the albums of ${artists.size} artists…`);
for (const [artistId, artist] of artists) {
  const groups: ReleaseGroup[] = [];
  for (let offset = 0; ; offset += 100) {
    // Pages follow one another.
    // oxlint-disable-next-line no-await-in-loop
    const body = await mb.get("release-group", {
      artist: artistId,
      type: "album|ep",
      "release-group-status": "website-default",
      limit: "100",
      offset: String(offset),
    });
    if (body === null) {
      artist.skipped = "not found";
      break;
    }
    const page = groupsSchema.parse(body);
    artist.groups = page["release-group-count"];
    if (artist.groups > maxGroups) {
      artist.skipped = `${artist.groups} official albums`;
      break;
    }
    for (const g of page["release-groups"]) {
      groups.push({
        id: g.id,
        title: g.title,
        ...(g["first-release-date"] && { firstReleaseDate: g["first-release-date"] }),
        primaryType: g["primary-type"] ?? null,
        secondaryTypes: g["secondary-types"] ?? [],
        disambiguation: g.disambiguation ?? "",
      });
    }
    if (offset + 100 >= artist.groups) break;
  }
  for (const group of groups) releaseGroups[group.id] = { ...group, artistId };
  for (const members of sameTitleGroups(groups)) {
    titleGroups.push({ artistId, artist: artist.name, members });
  }
}

/** The track titles of an album's earliest official release, compared on letters and digits. */
const tracksSchema = z.object({
  releases: z
    .array(
      z.object({
        date: z.string().optional(),
        status: z.string().nullish(),
        media: z
          .array(z.object({ tracks: z.array(z.object({ title: z.string() })).optional() }))
          .optional(),
      }),
    )
    .default([]),
});
async function trackTitles(releaseGroupId: string): Promise<Set<string>> {
  const body = await mb.get("release", {
    "release-group": releaseGroupId,
    inc: "recordings",
    limit: "100",
  });
  const releases = (body === null ? [] : tracksSchema.parse(body).releases).toSorted((a, b) =>
    (a.date ?? "9") < (b.date ?? "9") ? -1 : 1,
  );
  const release = releases.find((r) => r.status === "Official") ?? releases[0];
  return new Set(
    (release?.media ?? []).flatMap((m) => (m.tracks ?? []).map((t) => looseKey(t.title))),
  );
}

// Each same-title pair, judged by its metadata and then checked against the two track lists.
const memberIds = [...new Set(titleGroups.flatMap((g) => g.members.map((m) => m.id)))];
console.error(`Comparing the track lists of ${memberIds.length} albums that share a title…`);
const tracks = new Map<string, Set<string>>();
for (const id of memberIds) {
  // oxlint-disable-next-line no-await-in-loop
  tracks.set(id, await trackTitles(id));
}
for (const { artistId, artist, members } of titleGroups) {
  const pairs = members.flatMap((a, i) =>
    members.slice(i + 1).map((b) => {
      const compared = compareTracks(tracks.get(a.id) ?? new Set(), tracks.get(b.id) ?? new Set());
      return Object.assign(judgePair(a, b, compared), { a: a.id, b: b.id });
    }),
  );
  sameTitle.push({
    artistId,
    artist,
    key: titleKey(members[0]?.title ?? ""),
    members: members.map((m) => m.id),
    pairs,
  });
}

// The editions of same-title albums too, so their links can be identified.
const extra = [...new Set(sameTitle.flatMap((g) => g.members))].filter((id) => !base.has(id));
console.error(`Harvesting the editions of ${extra.length} more albums that share a title…`);
for (const id of extra) {
  // oxlint-disable-next-line no-await-in-loop
  await harvest(id);
}

// Only the release groups the corpus refers to: every listed album would make the file megabytes.
const referenced = new Set([...base, ...sameTitle.flatMap((g) => g.members)]);
const corpus = {
  base: [...base],
  missing,
  artists: Object.fromEntries(artists),
  releaseGroups: Object.fromEntries(
    Object.entries(releaseGroups).filter(([id]) => referenced.has(id)),
  ),
  editions,
  sameTitle,
};
await Bun.write(path.join(out, "corpus.json"), `${JSON.stringify(corpus, null, 2)}\n`);

const name = (id: string) => {
  const g = releaseGroups[id];
  return g
    ? `${g.title} (${g.firstReleaseDate?.slice(0, 4) ?? "?"}, ${[g.primaryType, ...g.secondaryTypes].join(" + ")}${g.disambiguation ? `, “${g.disambiguation}”` : ""}) \`${id}\``
    : id;
};
const review = sameTitle.flatMap((g) =>
  g.pairs
    .filter((p) => p.review)
    .map(
      (p) =>
        `- **${g.artist}**: ${name(p.a)} / ${name(p.b)}: ${p.same ? "same" : "different"}, ${p.reason}` +
        (p.tracks ? `; ${p.tracks.shared} titles shared of ${p.tracks.a} and ${p.tracks.b}` : ""),
    ),
);
await Bun.write(
  path.join(out, "review.md"),
  `# Same-title pairs to judge by hand\n\nGenerated by build.ts; answers go in verdicts.ts.\n\n${review.join("\n")}\n`,
);
console.error(
  `${base.size} base albums, ${editions.length} editions with links, ${sameTitle.length} same-title groups, ${review.length} pairs to review.`,
);
