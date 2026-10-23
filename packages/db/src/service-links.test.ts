// Step 1 of the identification chain (TS-41) against the local Postgres 18 (TS-121).

import { afterEach, beforeEach, expect, test } from "bun:test";

import { albums, albumServiceLinks, trashUnits, users } from "./schema";
import { findLinkedAlbum } from "./service-links";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const id = () => Bun.randomUUIDv7();

async function owner(): Promise<string> {
  const userId = id();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return userId;
}

async function albumLinked(ownerId: string, entityId: string, trashed = false): Promise<string> {
  const albumId = id();
  let trash = {};
  if (trashed) {
    const unitId = id();
    const deletedAt = new Date();
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId,
      kind: "album",
      rootId: albumId,
      deletedAt,
      expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
    });
    trash = { trashedAt: deletedAt, trashUnitId: unitId };
  }
  await t.db.insert(albums).values({
    id: albumId,
    ownerId,
    title: "Kind of Blue",
    artistCredit: "Miles Davis",
    originalYear: 1959,
    searchTitleKey: "kind of blue",
    searchArtistKey: "miles davis",
    ...trash,
  });
  await t.db.insert(albumServiceLinks).values({
    albumId,
    ownerId,
    service: "apple-music",
    url: `https://music.apple.com/us/album/${entityId}`,
    entityId,
  });
  return albumId;
}

test("finds the owner's album by service and entity id, Trash included", async () => {
  const anna = await owner();
  const active = await albumLinked(anna, "268443092");
  const trashed = await albumLinked(anna, "track:279764934", true);
  expect(await findLinkedAlbum(t.db, anna, "apple-music", "268443092")).toBe(active);
  expect(await findLinkedAlbum(t.db, anna, "apple-music", "track:279764934")).toBe(trashed);
  expect(await findLinkedAlbum(t.db, anna, "spotify", "268443092")).toBeUndefined();
  expect(await findLinkedAlbum(t.db, anna, "apple-music", "268443093")).toBeUndefined();
});

test("never another owner's album", async () => {
  const anna = await owner();
  const ben = await owner();
  await albumLinked(anna, "268443092");
  expect(await findLinkedAlbum(t.db, ben, "apple-music", "268443092")).toBeUndefined();
});
