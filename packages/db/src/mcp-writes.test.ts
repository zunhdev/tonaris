// What MCP's write tools read against the local Postgres 18 (TS-21, TS-16, TS-63): the owner's values a change is
// based on, read as the store reads them and never another account's, and a view's sequence by ID in manual order.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import {
  albumBase,
  containerBase,
  fieldBase,
  fieldValueBase,
  linkBase,
  viewPrefsBase,
  viewSequence,
} from "./mcp-writes";
import { albumFieldValues, albumServiceLinks, positions, users } from "./schema";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

/** A mutation without its ID, which `run` gives it. */
type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function run(principal: Principal, mutation: Unsent) {
  const { result } = await executeMutation(t.db, principal, {
    mutationId: uuidv7(),
    ...mutation,
  });
  expect(result.outcome.status).toBe("confirmed");
}

async function savedAlbum(principal: Principal & { userId: string }, title: string) {
  const id = uuidv7();
  await run(principal, {
    name: "album.create",
    args: {
      id,
      title,
      artistCredit: "Someone",
      releaseType: "album",
      isLive: false,
      originalYear: 1990,
      recordingYearStart: null,
      recordingYearEnd: null,
    },
  });
  return id;
}

async function savedList(principal: Principal, name: string) {
  const id = uuidv7();
  await run(principal, {
    name: "container.create",
    args: { id, kind: "list", parentId: null, name },
  });
  return id;
}

describe("a change's base (TS-21)", () => {
  test("each reader answers the owner's record now, and nothing of another account's", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const albumId = await savedAlbum(anna, "Bleach");
    const listId = await savedList(anna, "Grunge");
    const fieldId = uuidv7();
    await run(anna, {
      name: "field.create",
      args: { id: fieldId, name: "Rating", type: "number", options: [] },
    });
    await t.db.insert(albumFieldValues).values({ albumId, fieldId, numberValue: "4.5" });
    await t.db.insert(albumServiceLinks).values({
      albumId,
      ownerId: anna.userId,
      service: "spotify",
      url: "https://open.spotify.com/album/1",
      entityId: "1",
    });

    expect(await albumBase(t.db, { ownerId: anna.userId, albumId })).toMatchObject({
      id: albumId,
      title: "Bleach",
    });
    expect(await containerBase(t.db, { ownerId: anna.userId, containerId: listId })).toEqual({
      name: "Grunge",
      parentId: null,
      description: null,
    });
    expect(await fieldBase(t.db, { ownerId: anna.userId, fieldId })).toMatchObject({
      id: fieldId,
      name: "Rating",
    });
    expect(await fieldValueBase(t.db, { ownerId: anna.userId, albumId, fieldId })).toBe("4.5");
    expect(await linkBase(t.db, { ownerId: anna.userId, albumId, service: "spotify" })).toBe(
      "https://open.spotify.com/album/1",
    );
    expect(await linkBase(t.db, { ownerId: anna.userId, albumId, service: "tidal" })).toBeNull();
    expect(await viewPrefsBase(t.db, { personId: anna.userId, viewKey: listId })).toEqual({
      sortMode: null,
      sortDir: null,
      grouped: null,
      layout: null,
    });

    const theirs = { ownerId: ben.userId };
    expect(await albumBase(t.db, { ...theirs, albumId })).toBeUndefined();
    expect(await containerBase(t.db, { ...theirs, containerId: listId })).toBeUndefined();
    expect(await fieldBase(t.db, { ...theirs, fieldId })).toBeUndefined();
    expect(await fieldValueBase(t.db, { ...theirs, albumId, fieldId })).toBeUndefined();
    expect(await linkBase(t.db, { ...theirs, albumId, service: "spotify" })).toBeNull();
  });
});

describe("a view's sequence (TS-16)", () => {
  test("the IDs in manual order, then the fallback order, with the keys; nothing for another's list", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const listId = await savedList(anna, "Grunge");
    const [first, second, third] = [
      await savedAlbum(anna, "Bleach"),
      await savedAlbum(anna, "Nevermind"),
      await savedAlbum(anna, "In Utero"),
    ];
    for (const albumId of [first, second, third]) {
      // oxlint-disable-next-line no-await-in-loop
      await run(anna, { name: "membership.add", args: { listId, albumId } });
    }
    await t.db.insert(positions).values({
      personId: anna.userId,
      viewKey: listId,
      itemId: third,
      key: "a0",
    });

    expect(await viewSequence(t.db, { personId: anna.userId, viewKey: listId, limit: 2 })).toEqual({
      ids: [third, first],
      keys: new Map([[third, "a0"]]),
    });
    expect(await viewSequence(t.db, { personId: anna.userId, viewKey: "root", limit: 10 })).toEqual(
      { ids: [listId], keys: new Map() },
    );
    expect(
      await viewSequence(t.db, { personId: ben.userId, viewKey: listId, limit: 10 }),
    ).toBeUndefined();
    expect(
      await viewSequence(t.db, { personId: ben.userId, viewKey: "unsorted", limit: 10 }),
    ).toEqual({ ids: [], keys: new Map() });
  });
});
