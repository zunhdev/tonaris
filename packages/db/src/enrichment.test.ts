// Enrichment's writes against the local Postgres 18 (TS-15, TS-42, TS-44, TS-121): gaps filled under the owner's
// write lock with their provenance, a person's values kept, one logged change for clients, and release group ids
// that MusicBrainz merged or deleted.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  uuidv7,
  type Album,
  type AlbumFacts,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { albumReleaseGroup, enrichAlbum } from "./enrichment";
import { provenanceOf } from "./provenance";
import { albums, users } from "./schema";
import { executeMutation, readChanges } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const bleachId = "f1afec0b-26dd-3db5-9aa1-c91229a74a24";
const mergedId = "fcd3637b-3365-4780-802d-0013b070bca2";
const mergedIntoId = "d6d1de65-7e43-4277-b723-fc74a2b385e1";
const front = `https://coverartarchive.org/release-group/${bleachId}/front-500`;
const now = new Date("2026-10-24T12:00:00Z");

/** MusicBrainz's *Bleach*, as `describeAlbum()` answers it. */
const bleach = (askedId = bleachId, releaseGroupId = askedId): AlbumFacts => {
  const read = <T>(value: T) => ({ value, source: "musicbrainz" as const, ref: releaseGroupId });
  return {
    status: "found",
    askedId,
    releaseGroupId,
    values: {
      title: read("Bleach"),
      artistCredit: read("Nirvana"),
      releaseType: read("album" as const),
      isLive: read(false),
      originalYear: read(1989),
      artworkUrl: { value: front, source: "coverartarchive", ref: releaseGroupId },
    },
  };
};

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

/** An album its owner entered by hand, then saved as `releaseGroupId`, as capture will. */
async function saved(
  principal: Principal & { kind: "user" },
  values: Partial<Album> = {},
  releaseGroupId: string | null = bleachId,
): Promise<Album> {
  const album: Album = {
    id: uuidv7(),
    title: "Bleach",
    artistCredit: "Nirvana",
    releaseType: null,
    isLive: false,
    originalYear: 1990,
    recordingYearStart: null,
    recordingYearEnd: null,
    artworkUrl: null,
    ...values,
  };
  const { result } = await executeMutation(t.db, principal, {
    mutationId: uuidv7(),
    name: "album.create",
    args: album,
  });
  expect(result.outcome.status).toBe("confirmed");
  await t.db
    .update(albums)
    .set({ mbReleaseGroupId: releaseGroupId })
    .where(eq(albums.id, album.id));
  return album;
}

const sourcesOf = async (albumId: string) =>
  Object.fromEntries(
    (await provenanceOf(t.db, albumId)).map((entry) => [entry.field, entry.source]),
  );

describe("a person's writes record `user` (TS-15)", () => {
  test("a created album's values are the person's; its unknown ones have no source", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal);
    expect(await sourcesOf(album.id)).toEqual({
      title: "user",
      artistCredit: "user",
      isLive: "user",
      originalYear: "user",
    });
  });

  test("an edit of an enriched value makes it the person's, and clearing one removes its source", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal);
    await enrichAlbum(t.db, principal.userId, album.id, bleach(), now);
    expect((await sourcesOf(album.id)).releaseType).toBe("musicbrainz");

    const update = (args: Partial<Album>, base: Partial<Album>): Mutation => ({
      mutationId: uuidv7(),
      name: "album.update",
      args: { id: album.id, ...args },
      base,
    });
    await executeMutation(t.db, principal, update({ releaseType: "ep" }, { releaseType: "album" }));
    expect((await sourcesOf(album.id)).releaseType).toBe("user");
    await executeMutation(t.db, principal, update({ releaseType: null }, { releaseType: "ep" }));
    expect((await sourcesOf(album.id)).releaseType).toBeUndefined();
  });
});

describe("enrichAlbum (TS-42, FR-03.3, AC-10)", () => {
  test("fills gaps with their provenance, keeps the person's values, and logs one change", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal);
    const enriched = await enrichAlbum(t.db, principal.userId, album.id, bleach(), now);
    if (enriched.status !== "applied") throw new Error(enriched.status);

    const [row] = await t.db.select().from(albums).where(eq(albums.id, album.id));
    expect(row).toMatchObject({
      title: "Bleach",
      originalYear: 1990,
      releaseType: "album",
      artworkUrl: front,
    });
    expect(await provenanceOf(t.db, album.id)).toContainEqual({
      field: "releaseType",
      source: "musicbrainz",
      sourceRef: bleachId,
      retrievedAt: now,
    });
    expect((await sourcesOf(album.id)).artworkUrl).toBe("coverartarchive");
    expect((await sourcesOf(album.id)).originalYear).toBe("user");

    // One change for clients, with the album as they hold it, and no mutation id.
    expect(enriched.changes).toEqual([
      {
        seq: 2,
        entity: "album",
        id: album.id,
        op: "update",
        data: { ...album, releaseType: "album", artworkUrl: front },
        mutationId: null,
      },
    ]);
    expect(await readChanges(t.db, principal.userId, 1, 10)).toEqual(enriched.changes);
  });

  test("enriching again from the same facts writes and logs nothing", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal);
    await enrichAlbum(t.db, principal.userId, album.id, bleach(), now);
    const again = await enrichAlbum(t.db, principal.userId, album.id, bleach(), now);
    expect(again).toMatchObject({ status: "applied", changes: [], plan: { values: {} } });
    expect(await readChanges(t.db, principal.userId, 2, 10)).toEqual([]);
  });

  test("filling only the artwork logs it for clients, who show it (TON-48)", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal, { releaseType: "album" });
    const enriched = await enrichAlbum(t.db, principal.userId, album.id, bleach(), now);
    expect(enriched).toMatchObject({
      status: "applied",
      changes: [{ entity: "album", op: "update", data: { artworkUrl: front } }],
      plan: { values: { artworkUrl: front } },
    });
    const [row] = await t.db.select({ artworkUrl: albums.artworkUrl }).from(albums);
    expect(row?.artworkUrl).toBe(front);
  });

  test("another owner's album isn't found, and stays as it was", async () => {
    const owner = await newPrincipal();
    const stranger = await newPrincipal();
    const album = await saved(owner);
    expect(await enrichAlbum(t.db, stranger.userId, album.id, bleach(), now)).toMatchObject({
      status: "failed",
      code: "not_found",
    });
    const [row] = await t.db.select({ releaseType: albums.releaseType }).from(albums);
    expect(row?.releaseType).toBeNull();
  });
});

describe("enrichAlbum: changed release group ids (TS-44)", () => {
  test("a merged release group's new id is stored", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal, {}, mergedId);
    const enriched = await enrichAlbum(
      t.db,
      principal.userId,
      album.id,
      bleach(mergedId, mergedIntoId),
      now,
    );
    expect(enriched).toMatchObject({ status: "applied", plan: { identity: "merged" } });
    expect(await albumReleaseGroup(t.db, principal.userId, album.id)).toBe(mergedIntoId);
  });

  test("a deleted release group leaves the album unidentified, with its data", async () => {
    const principal = await newPrincipal();
    const album = await saved(principal, { releaseType: "album" });
    const enriched = await enrichAlbum(
      t.db,
      principal.userId,
      album.id,
      { status: "deleted", askedId: bleachId },
      now,
    );
    expect(enriched).toMatchObject({
      status: "applied",
      changes: [],
      plan: { identity: "deleted" },
    });
    expect(await albumReleaseGroup(t.db, principal.userId, album.id)).toBeNull();
    const [row] = await t.db.select().from(albums);
    expect(row).toMatchObject({
      title: "Bleach",
      artistCredit: "Nirvana",
      releaseType: "album",
      originalYear: 1990,
    });
  });

  test("an album the account doesn't have has no release group to ask about", async () => {
    const principal = await newPrincipal();
    expect(await albumReleaseGroup(t.db, principal.userId, uuidv7())).toBeUndefined();
  });
});
