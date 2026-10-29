// The export's reader against the local Postgres 18 (FR-08.3–FR-08.5, TS-80): the owner's whole collection, Trash
// included and marked, built into a valid export; and what isn't the owner's collection is absent, even with a
// shared list, an invitation, a link, a saved reference to another owner's list, and a display name.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { buildExport, exportSchema, uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import { exportSource } from "./export";
import { albums, savedReferences, shareGrants, shareLinks, users } from "./schema";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function person(email: string): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email });
  return { kind: "user", userId, role: "user", client: "web" };
}

async function run(who: Principal, mutation: Mutation) {
  const { result } = await executeMutation(t.db, who, mutation);
  expect(result.outcome.status).toBe("confirmed");
}

async function list(who: Principal, name: string, parentId: string | null = null) {
  const id = uuidv7();
  await run(who, {
    mutationId: uuidv7(),
    name: "container.create",
    args: { id, kind: "list", parentId, name },
  });
  return id;
}

async function album(who: Principal & { kind: "user" }, title: string) {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId: who.userId,
    title,
    artistCredit: "Miles Davis",
    originalYear: 1959,
    searchTitleKey: title.toLowerCase(),
    searchArtistKey: "miles davis",
  });
  return id;
}

const everything = () => true;

describe("the export's reader (FR-08)", () => {
  test("reads the whole collection, Trash included, into a valid export", async () => {
    const anna = await person("anna@example.com");
    const folder = uuidv7();
    await run(anna, {
      mutationId: uuidv7(),
      name: "container.create",
      args: { id: folder, kind: "folder", parentId: null, name: "Old" },
    });
    const inner = await list(anna, "Bebop", folder);
    const jazz = await list(anna, "Jazz");
    const kind = await album(anna, "Kind of Blue");
    await run(anna, {
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: jazz, albumId: kind },
    });
    await run(anna, {
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: inner, albumId: kind },
    });
    const unitId = uuidv7();
    await run(anna, {
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: folder, unitId },
    });

    const result = exportSchema.parse(
      buildExport(await exportSource(t.db, anna.userId), everything),
    );
    expect(result.albums.map((each) => each.title)).toEqual(["Kind of Blue"]);
    expect(
      result.tree.containers.map(({ name, status, albumIds }) => ({ name, status, albumIds })),
    ).toEqual([
      { name: "Old", status: "trashed", albumIds: [] },
      { name: "Bebop", status: "trashed", albumIds: [kind] },
      { name: "Jazz", status: "active", albumIds: [kind] },
    ]);
    expect(result.trash.units).toMatchObject([
      {
        id: unitId,
        kind: "folder",
        rootId: folder,
        containerIds: [folder, inner],
        formerMemberships: [{ listId: inner, albumId: kind }],
      },
    ]);
  });

  test("leaves out sharing, Shared with me, other owners' content and the account", async () => {
    const anna = await person("anna-sign-in@example.com");
    await t.db.update(users).set({ displayName: "Anna Example" }).where(eq(users.id, anna.userId));
    const ben = await person("ben-sign-in@example.com");
    const shared = await list(anna, "Shared jazz");
    await album(anna, "Kind of Blue");
    await t.db.insert(shareGrants).values({
      id: uuidv7(),
      containerId: shared,
      granteeId: ben.userId,
      invitedEmail: "ben-invited@example.com",
      status: "accepted",
    });
    await t.db.insert(shareLinks).values({
      id: uuidv7(),
      containerId: shared,
      tokenHash: new Bun.CryptoHasher("sha256").update("link").digest(),
    });
    const bens = await list(ben, "Ben's secret list");
    const bensAlbum = await album(ben, "Ben's album");
    await run(ben, {
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: bens, albumId: bensAlbum },
    });
    await t.db.insert(savedReferences).values({ viewerId: anna.userId, containerId: bens });

    const text = JSON.stringify(buildExport(await exportSource(t.db, anna.userId), everything));
    for (const absent of [
      "anna-sign-in@example.com",
      "Anna Example",
      "ben-sign-in@example.com",
      "ben-invited@example.com",
      ben.userId,
      bens,
      "Ben's secret list",
      "Ben's album",
    ])
      expect(text).not.toContain(absent);
    expect(text).toContain("Shared jazz");
  });
});
