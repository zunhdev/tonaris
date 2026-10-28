// `album.capture` against an in-memory store (FR-02.2, FR-02.6, FR-02.9, FR-02.12, FR-06.4, FR-14.4, TS-44): one test
// per spec scenario, with the source the API would have prepared. The API's tests run the same scenarios end to end.

import { describe, expect, test } from "bun:test";

import type { Album, AlbumFields } from "./albums";
import {
  missingYearReason,
  type CapturedLink,
  type CaptureSource,
  type FoundFacts,
} from "./capture";
import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import { maxMemberships } from "./limits";
import { membershipKey } from "./memberships";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const now = new Date("2026-10-24T12:00:00.000Z");

const bleachId = "f1afec0b-26dd-3db5-9aa1-c91229a74a24";
const weezer2001Id = "6f5c4a44-0ddd-3f4f-b0cc-6c18e4f0c5f2";
const mergedId = "fcd3637b-3365-4780-802d-0013b070bca2";
const mergedIntoId = "d6d1de65-7e43-4277-b723-fc74a2b385e1";

const spotifyLink: CapturedLink = {
  service: "spotify",
  url: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  entityId: "1KQ1Pf4ikoK1jBbOtOHvOv",
};
const appleLink: CapturedLink = {
  service: "apple-music",
  url: "https://music.apple.com/us/album/1440835185",
  entityId: "1440835185",
};

/** MusicBrainz's facts for a release group, as `describeAlbum()` answers them. */
function facts(
  releaseGroupId: string,
  values: Partial<Record<keyof AlbumFields, unknown>> & { artworkUrl?: string },
  askedId = releaseGroupId,
): FoundFacts {
  return {
    status: "found",
    askedId,
    releaseGroupId,
    values: Object.fromEntries(
      Object.entries(values).map(([field, value]) => [
        field,
        {
          value,
          source: field === "artworkUrl" ? "coverartarchive" : "musicbrainz",
          ref: releaseGroupId,
        },
      ]),
    ),
  };
}

const bleachFacts = facts(bleachId, {
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album",
  isLive: false,
  originalYear: 1989,
  artworkUrl: `https://coverartarchive.org/release-group/${bleachId}/front-500`,
});

const identified = (
  found: FoundFacts,
  extra: Partial<Extract<CaptureSource, { kind: "identified" }>> = {},
  link = spotifyLink,
): CaptureSource => ({ kind: "identified", link, facts: found, merged: [], ...extra });

/** An album the owner saved, with its release group. */
const saved = (
  title: string,
  values: Partial<Album & { trashed: boolean; releaseGroupId: string | null }> = {},
) => ({
  id: uuidv7(),
  title,
  artistCredit: "Nirvana",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ownerId: owner,
  releaseGroupId: bleachId,
  ...values,
});

const list = (name: string, values: Partial<StoredContainer> = {}): StoredContainer => ({
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name,
  ownerId: owner,
  trashed: false,
  ...values,
});

const capture = (
  listId: string | null,
  extra: Partial<Extract<Mutation, { name: "album.capture" }>["args"]> = {},
): Extract<Mutation, { name: "album.capture" }> => ({
  mutationId: uuidv7(),
  name: "album.capture",
  args: { albumId: uuidv7(), link: spotifyLink.url, listId, ...extra },
});

function setup(fill: Parameters<typeof memoryStore>[0] = {}) {
  const memory = memoryStore(fill);
  const run = (mutation: Mutation, source: CaptureSource | undefined) =>
    runCommand(mutation, { principal: anna, store: memory.store, now, capture: source });
  const listsOf = (albumId: string) =>
    [...memory.memberships.values()]
      .filter((entry) => entry.albumId === albumId)
      .map((entry) => entry.listId)
      .toSorted();
  return { ...memory, run, listsOf };
}

function applied(result: CommandResult) {
  if (result.status !== "applied") throw new Error(`Expected applied, got ${result.status}`);
  for (const change of result.changes) changeSchema.parse({ seq: 1, mutationId: null, ...change });
  return result;
}

describe("album.capture: a confident match reuses the saved album (FR-02.9, FR-02.12, AC-09)", () => {
  test("another edition of a saved album reuses it, and puts it in the list", async () => {
    const bleach = saved("Bleach");
    const grunge = list("Grunge");
    const t = setup({ albums: [bleach], containers: [grunge] });
    const mutation = capture(grunge.id);
    expect(mutationSchema.parse(mutation)).toEqual(mutation);

    const result = applied(await t.run(mutation, identified(bleachFacts)));
    expect(result.result).toEqual({
      albumId: bleach.id,
      match: "reused",
      alreadyInList: false,
      keptLink: null,
    });
    expect(t.albums.size).toBe(1);
    expect(t.listsOf(bleach.id)).toEqual([grunge.id]);
    // The gaps are filled; its values are kept.
    expect(t.albums.get(bleach.id)?.artworkUrl).toContain(bleachId);
  });

  test("an album already in the list keeps its entry, and says so (FR-01.7)", async () => {
    const bleach = saved("Bleach");
    const grunge = list("Grunge");
    const t = setup({
      albums: [bleach],
      containers: [grunge],
      memberships: [
        {
          listId: grunge.id,
          albumId: bleach.id,
          addedAt: "2026-10-01T00:00:00.000Z",
          ownerId: owner,
        },
      ],
    });
    const result = applied(await t.run(capture(grunge.id), identified(bleachFacts)));
    expect(result.result).toMatchObject({ match: "reused", alreadyInList: true });
    expect(t.memberships.get(membershipKey(grunge.id, bleach.id))?.addedAt).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  test("the same link reuses its album (TS-41 step 1)", async () => {
    const bleach = saved("Bleach", { releaseGroupId: null });
    const t = setup({ albums: [bleach], links: [{ albumId: bleach.id, ...spotifyLink }] });
    const result = applied(
      await t.run(capture(null), { kind: "linked", link: spotifyLink, albumId: bleach.id }),
    );
    expect(result.result).toMatchObject({ albumId: bleach.id, match: "reused", keptLink: null });
  });

  test("a saved album whose release group MusicBrainz merged into this one is reused, under the new id (TS-44)", async () => {
    const shoot = saved("Shoot for the Stars Aim for the Moon", { releaseGroupId: mergedId });
    const t = setup({ albums: [shoot] });
    const newFacts = facts(mergedIntoId, {
      title: "Shoot for the Stars Aim for the Moon",
      originalYear: 2020,
    });
    const ownFacts = facts(
      mergedIntoId,
      { title: "Shoot for the Stars Aim for the Moon", originalYear: 2020 },
      mergedId,
    );
    const result = applied(
      await t.run(
        capture(null),
        identified(newFacts, { merged: [{ albumId: shoot.id, facts: ownFacts }] }),
      ),
    );
    expect(result.result).toMatchObject({ albumId: shoot.id, match: "reused" });
    expect(t.identities.get(shoot.id)?.releaseGroupId).toBe(mergedIntoId);
  });

  test("a merge match saved as something else since isn't one", async () => {
    const shoot = saved("Shoot for the Stars Aim for the Moon", { releaseGroupId: weezer2001Id });
    const t = setup({ albums: [shoot] });
    const newFacts = facts(mergedIntoId, {
      title: "Shoot",
      artistCredit: "Pop Smoke",
      originalYear: 2020,
    });
    const ownFacts = facts(mergedIntoId, { title: "Shoot" }, mergedId);
    const result = applied(
      await t.run(
        capture(null),
        identified(newFacts, { merged: [{ albumId: shoot.id, facts: ownFacts }] }),
      ),
    );
    expect(result.result).toMatchObject({ match: "created" });
  });

  test("the same title from a different release group is a different album", async () => {
    const weezer1994 = saved("Weezer", { artistCredit: "Weezer", originalYear: 1994 });
    const t = setup({ albums: [weezer1994] });
    const weezer2001 = facts(weezer2001Id, {
      title: "Weezer",
      artistCredit: "Weezer",
      releaseType: "album",
      isLive: false,
      originalYear: 2001,
    });
    const mutation = capture(null);
    const result = applied(await t.run(mutation, identified(weezer2001)));
    expect(result.result).toMatchObject({ albumId: mutation.args.albumId, match: "created" });
    expect(t.albums.size).toBe(2);
  });
});

describe("album.capture: re-addition from Trash (FR-14.4, TS-13, AC-07)", () => {
  test("re-added into a list: it leaves Trash, and is in that list only", async () => {
    const favorites = list("Favorites");
    const lateNight = list("Late night");
    const bleach = saved("Bleach", { trashed: true });
    const entry = (listId: string) => ({
      listId,
      albumId: bleach.id,
      addedAt: "2026-10-01T00:00:00.000Z",
      ownerId: owner,
    });
    const t = setup({
      albums: [bleach],
      containers: [favorites, lateNight],
      memberships: [entry(favorites.id), entry(lateNight.id)],
    });
    const result = applied(await t.run(capture(lateNight.id), identified(bleachFacts)));
    expect(result.result).toMatchObject({
      albumId: bleach.id,
      match: "restored",
      alreadyInList: false,
    });
    expect(t.albums.get(bleach.id)?.trashed).toBe(false);
    expect(t.listsOf(bleach.id)).toEqual([lateNight.id]);
    expect(result.changes).toContainEqual({
      entity: "membership",
      id: membershipKey(favorites.id, bleach.id),
      op: "delete",
      data: null,
    });
  });

  test("re-added without a list, it goes to the top of an arranged Unsorted", async () => {
    const other = saved("Nevermind", { releaseGroupId: null });
    const bleach = saved("Bleach", { trashed: true });
    const t = setup({
      albums: [other, bleach],
      positions: [{ personId: owner, viewKey: "unsorted", itemId: other.id, key: "a0" }],
    });
    const result = applied(await t.run(capture(null), identified(bleachFacts)));
    expect(result.result).toMatchObject({ match: "restored" });
    const keys = [...t.positions.values()].filter((row) => row.viewKey === "unsorted");
    const top = keys.toSorted((a, b) => (a.key < b.key ? -1 : 1))[0];
    expect(top?.itemId).toBe(bleach.id);
  });

  test("an entry in a trashed list is kept for its recovery", async () => {
    const archive = list("Archive", { trashed: true });
    const bleach = saved("Bleach", { trashed: true });
    const t = setup({
      albums: [bleach],
      containers: [archive],
      memberships: [
        {
          listId: archive.id,
          albumId: bleach.id,
          addedAt: "2026-10-01T00:00:00.000Z",
          ownerId: owner,
        },
      ],
    });
    applied(await t.run(capture(null), identified(bleachFacts)));
    expect(t.listsOf(bleach.id)).toEqual([archive.id]);
  });

  test("an active record wins over a trashed one (FR-14.3)", async () => {
    const trashed = saved("Bleach", { trashed: true });
    const active = saved("Bleach");
    const t = setup({ albums: [trashed, active] });
    const result = applied(await t.run(capture(null), identified(bleachFacts)));
    expect(result.result).toMatchObject({ albumId: active.id, match: "reused" });
    expect(t.albums.get(trashed.id)?.trashed).toBe(true);
  });
});

describe("album.capture: without a list (FR-02.2, AC-07)", () => {
  test("a new album goes to Unsorted, from MusicBrainz's values with their sources", async () => {
    const t = setup();
    const mutation = capture(null);
    const result = applied(await t.run(mutation, identified(bleachFacts)));
    const { albumId } = mutation.args;
    expect(result.result).toEqual({
      albumId,
      match: "created",
      alreadyInList: false,
      keptLink: null,
    });
    expect(t.albums.get(albumId)).toMatchObject({
      title: "Bleach",
      originalYear: 1989,
      trashed: false,
    });
    expect(t.listsOf(albumId)).toEqual([]);
    expect(t.identities.get(albumId)?.releaseGroupId).toBe(bleachId);
    expect(t.provenance.get(albumId)?.get("title")?.source).toBe("musicbrainz");
    expect(t.provenance.get(albumId)?.get("artworkUrl")?.source).toBe("coverartarchive");
    expect(t.links.get(`${albumId}:spotify`)).toEqual(spotifyLink);
    expect(result.changes[0]).toMatchObject({ entity: "album", id: albumId, op: "insert" });
    // Clients get the link with the album (TON-46).
    expect(result.changes[1]).toEqual({
      entity: "link",
      id: `${albumId}:spotify`,
      op: "insert",
      data: { albumId, service: "spotify", url: spotifyLink.url },
    });
  });

  test("a reused album keeps its lists", async () => {
    const favorites = list("Favorites");
    const bleach = saved("Bleach");
    const t = setup({
      albums: [bleach],
      containers: [favorites],
      memberships: [
        {
          listId: favorites.id,
          albumId: bleach.id,
          addedAt: "2026-10-01T00:00:00.000Z",
          ownerId: owner,
        },
      ],
    });
    applied(await t.run(capture(null), identified(bleachFacts)));
    expect(t.listsOf(bleach.id)).toEqual([favorites.id]);
  });
});

describe("album.capture: required information (FR-02.6, AC-08)", () => {
  const undated = facts(bleachId, {
    title: "Bleach",
    artistCredit: "Nirvana",
    releaseType: "album",
  });

  test("MusicBrainz without a year asks for the details, prefilled, and saves nothing", async () => {
    const t = setup();
    const result = await t.run(capture(null), identified(undated));
    expect(result).toEqual({
      status: "needs_input",
      need: "details",
      candidates: [
        {
          service: "spotify",
          url: spotifyLink.url,
          reason: missingYearReason,
          prefill: {
            source: "musicbrainz",
            values: { title: "Bleach", artistCredit: "Nirvana", releaseType: "album" },
          },
        },
      ],
    });
    expect(t.albums.size).toBe(0);
  });

  test("the details given: saved as the release group, with the offered values' sources kept", async () => {
    const t = setup();
    const details: AlbumFields = {
      title: "Bleach",
      artistCredit: "Nirvana",
      releaseType: "album",
      isLive: false,
      originalYear: 1989,
      recordingYearStart: null,
      recordingYearEnd: null,
    };
    const mutation = capture(null, { details });
    applied(await t.run(mutation, identified(undated, { details })));
    const { albumId } = mutation.args;
    expect(t.identities.get(albumId)?.releaseGroupId).toBe(bleachId);
    const sources = Object.fromEntries(
      [...(t.provenance.get(albumId)?.values() ?? [])].map((entry) => [entry.field, entry.source]),
    );
    expect(sources).toEqual({
      title: "musicbrainz",
      artistCredit: "musicbrainz",
      releaseType: "musicbrainz",
      isLive: "user",
      originalYear: "user",
    });
  });

  test("Apple's hints kept as offered stay `itunes-lookup`; an edited year is the person's", async () => {
    const t = setup();
    const details: AlbumFields = {
      title: "Idéal",
      artistCredit: "Trust",
      releaseType: null,
      isLive: false,
      originalYear: 1984,
      recordingYearStart: null,
      recordingYearEnd: null,
    };
    const mutation = capture(null, { link: appleLink.url, details });
    applied(
      await t.run(mutation, {
        kind: "entered",
        link: appleLink,
        details,
        prefill: {
          source: "itunes-lookup",
          values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
        },
      }),
    );
    const { albumId } = mutation.args;
    const sources = Object.fromEntries(
      [...(t.provenance.get(albumId)?.values() ?? [])].map((entry) => [entry.field, entry.source]),
    );
    expect(sources).toEqual({
      title: "itunes-lookup",
      artistCredit: "itunes-lookup",
      isLive: "user",
      originalYear: "user",
    });
    expect(t.identities.get(albumId)?.releaseGroupId).toBeNull();
    expect(t.links.get(`${albumId}:apple-music`)).toEqual(appleLink);
  });

  test("details that still lack the year are refused, naming it", async () => {
    const t = setup();
    const details: AlbumFields = {
      title: "Bleach",
      artistCredit: "Nirvana",
      releaseType: null,
      isLive: false,
      originalYear: null,
      recordingYearStart: null,
      recordingYearEnd: null,
    };
    const result = await t.run(capture(null, { details }), {
      kind: "entered",
      link: spotifyLink,
      details,
    });
    expect(result).toMatchObject({ status: "failed", code: "required_missing" });
    expect(t.albums.size).toBe(0);
  });
});

describe("album.capture: links (FR-06.4)", () => {
  test("a second service's link is added", async () => {
    const bleach = saved("Bleach");
    const t = setup({ albums: [bleach], links: [{ albumId: bleach.id, ...spotifyLink }] });
    const result = applied(
      await t.run(capture(null, { link: appleLink.url }), identified(bleachFacts, {}, appleLink)),
    );
    expect(t.links.get(`${bleach.id}:apple-music`)).toEqual(appleLink);
    expect(result.changes).toContainEqual({
      entity: "link",
      id: `${bleach.id}:apple-music`,
      op: "insert",
      data: { albumId: bleach.id, service: "apple-music", url: appleLink.url },
    });
    expect(t.links.get(`${bleach.id}:spotify`)).toEqual(spotifyLink);
  });

  test("a different link for the same service is kept, the list still applied, and both reported", async () => {
    const bleach = saved("Bleach");
    const grunge = list("Grunge");
    const other: CapturedLink = {
      service: "spotify",
      url: "https://open.spotify.com/album/0000000000000000000001",
      entityId: "0000000000000000000001",
    };
    const t = setup({
      albums: [bleach],
      containers: [grunge],
      links: [{ albumId: bleach.id, ...spotifyLink }],
    });
    const result = applied(
      await t.run(capture(grunge.id, { link: other.url }), identified(bleachFacts, {}, other)),
    );
    expect(result.result).toMatchObject({
      keptLink: { service: "spotify", kept: spotifyLink.url, pasted: other.url },
    });
    expect(t.links.get(`${bleach.id}:spotify`)).toEqual(spotifyLink);
    expect(result.changes.some((change) => change.entity === "link")).toBe(false);
    expect(t.listsOf(bleach.id)).toEqual([grunge.id]);
  });
});

describe("album.capture: refusals change nothing (X-05)", () => {
  test("a missing, folder or trashed destination is refused before anything is written", async () => {
    const folder = { ...list("Genres"), kind: "folder" as const };
    const trashed = list("Old", { trashed: true });
    const bleach = saved("Bleach", { trashed: true });
    const t = setup({ albums: [bleach], containers: [folder, trashed] });
    expect(await t.run(capture(uuidv7()), identified(bleachFacts))).toMatchObject({
      code: "not_found",
    });
    expect(await t.run(capture(folder.id), identified(bleachFacts))).toMatchObject({
      code: "invalid_destination",
    });
    expect(await t.run(capture(trashed.id), identified(bleachFacts))).toMatchObject({
      code: "trashed",
    });
    expect(t.albums.get(bleach.id)?.trashed).toBe(true);
  });

  test("an entry past the limit is refused before a trashed album is reactivated", async () => {
    const grunge = list("Grunge");
    const bleach = saved("Bleach", { trashed: true });
    const t = setup({ albums: [bleach], containers: [grunge] });
    t.store.countMemberships = () => Promise.resolve(maxMemberships);
    expect(await t.run(capture(grunge.id), identified(bleachFacts))).toMatchObject({
      code: "limit_exceeded",
    });
    expect(t.albums.get(bleach.id)?.trashed).toBe(true);
  });

  test("an album ID already taken is refused", async () => {
    const taken = saved("Nevermind", { releaseGroupId: null });
    const t = setup({ albums: [taken] });
    expect(
      await t.run(capture(null, { albumId: taken.id }), identified(bleachFacts)),
    ).toMatchObject({
      code: "validation_failed",
    });
  });

  test("with no source, as when providers can't be asked, it fails as unavailable", async () => {
    const t = setup();
    expect(await t.run(capture(null), undefined)).toMatchObject({ code: "provider_unavailable" });
  });
});
