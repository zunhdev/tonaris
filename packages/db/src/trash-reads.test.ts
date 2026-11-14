// Reads that leave out the "not in Trash" filter leaked Trash content to editors, viewers and agents several times
// (DRIFT-098: `/s/:token/reference`, `canEditAlbum`, `findLinkedAlbum`, capture's choices, an editor's Undo). Every
// sharing read in access.ts is listed here with what it must say of what is in Trash, so a new one fails this test
// until it is checked against Trash too.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { shareToken, shareTokenHash, uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import * as access from "./access";
import { albums, shareGrants, shareLinks, users } from "./schema";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function person(name: string): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${name}-${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

/** A mutation without its ID, which `run` gives it. */
type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function run(who: Principal, mutation: Unsent) {
  const { result } = await executeMutation(t.db, who, { mutationId: uuidv7(), ...mutation });
  expect(result.outcome.status).toBe("confirmed");
}

describe("every sharing read leaves Trash out (DRIFT-098)", () => {
  test("a folder, list or album in Trash is neither readable nor editable through a share or a link", async () => {
    const denis = await person("denis");
    const anna = await person("anna");
    const metal = uuidv7();
    const old = uuidv7();
    const doom = uuidv7();
    await run(denis, {
      name: "container.create",
      args: { id: metal, kind: "folder", parentId: null, name: "Metal" },
    });
    for (const [id, name] of [
      [doom, "Doom"],
      [old, "Old"],
    ] as const)
      // oxlint-disable-next-line no-await-in-loop
      await run(denis, {
        name: "container.create",
        args: { id, kind: "list", parentId: metal, name },
      });
    const binned = uuidv7();
    await t.db.insert(albums).values({
      id: binned,
      ownerId: denis.userId,
      title: "Binned",
      artistCredit: "Someone",
      originalYear: 1990,
      searchTitleKey: "binned",
      searchArtistKey: "someone",
    });
    await run(denis, { name: "membership.add", args: { listId: doom, albumId: binned } });
    await t.db.insert(shareGrants).values({
      id: uuidv7(),
      containerId: metal,
      granteeId: anna.userId,
      invitedEmail: "anna@example.com",
      status: "accepted",
      role: "edit",
    });
    const linkId = uuidv7();
    const hash = await shareTokenHash(await shareToken("secret", linkId));
    await t.db
      .insert(shareLinks)
      .values({ id: linkId, containerId: old, tokenHash: Buffer.from(hash) });
    // Both go to Trash: the list "Old", with its link, and the album.
    await run(denis, { name: "container.delete", args: { id: old, unitId: uuidv7() } });
    await run(denis, { name: "album.delete", args: { id: binned, unitId: uuidv7() } });
    const viewer = { kind: "person", userId: anna.userId } as const;

    /** What each read says of what is in Trash; `null` for what reads nothing. */
    const covered: Record<keyof typeof access, (() => Promise<unknown>) | null> = {
      readableContainers: async () => (await access.readableContainers(t.db, viewer)).has(old),
      canReadContainer: () => access.canReadContainer(t.db, viewer, old),
      editableContainers: async () => (await access.editableContainers(t.db, anna.userId)).has(old),
      canEditContainer: () => access.canEditContainer(t.db, anna.userId, old),
      editSourcesAbove: async () =>
        (await access.editSourcesAbove(t.db, anna.userId, old)).length > 0,
      canEditAlbum: () => access.canEditAlbum(t.db, anna.userId, binned),
      roleOn: async () => (await access.roleOn(t.db, viewer, old)) !== undefined,
      linkByTokenHash: async () => (await access.linkByTokenHash(t.db, hash)) !== undefined,
      // A SQL condition, not a read.
      editGrant: null,
    };
    // A new read in access.ts must be listed above, with its check.
    expect(Object.keys(covered).toSorted()).toEqual(Object.keys(access).toSorted());
    const reached: Record<string, unknown> = {};
    for (const [name, check] of Object.entries(covered)) if (check) reached[name] = await check();
    expect(Object.values(reached).every((value) => value === false)).toBe(true);
    // And what isn't in Trash is reached, so the checks above can fail.
    expect(await access.canEditContainer(t.db, anna.userId, doom)).toBe(true);
  });
});
