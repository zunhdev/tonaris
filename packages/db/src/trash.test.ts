// Trash for folders and lists against the local Postgres 18 (FR-01.11 to FR-01.15, TS-13, TS-121): a folder and its
// lists in one unit, their entries kept but out of the bootstrap, Unsorted placement, the unit in the bootstrap, and
// recovery bringing it all back; a list deleted on its own keeps its unit when its folder goes too.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import { albums, containers, memberships, trashUnits, users } from "./schema";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: Principal & { kind: "user" };

beforeEach(async () => {
  t = await createTestDatabase();
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  anna = { kind: "user", userId, role: "user", client: "web" };
});

afterEach(async () => {
  await t.drop();
});

async function run(mutation: Mutation) {
  const { result, changes } = await executeMutation(t.db, anna, mutation);
  return { outcome: result.outcome, changes };
}

async function create(kind: "folder" | "list", name: string, parentId: string | null = null) {
  const id = uuidv7();
  const { outcome } = await run({
    mutationId: uuidv7(),
    name: "container.create",
    args: { id, kind, parentId, name },
  });
  expect(outcome.status).toBe("confirmed");
  return id;
}

async function newAlbum(title: string) {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId: anna.userId,
    title,
    artistCredit: "Sleep",
    originalYear: 1999,
    searchTitleKey: title.toLowerCase(),
    searchArtistKey: "sleep",
  });
  return id;
}

describe("Trash in Postgres (FR-01.11 to FR-01.15)", () => {
  test("a folder goes with its lists as one unit, out of the bootstrap, and comes back", async () => {
    const metal = await create("folder", "Metal");
    const doom = await create("list", "Doom", metal);
    const dopesmoker = await newAlbum("Dopesmoker");
    await run({
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: doom, albumId: dopesmoker },
    });

    const unitId = uuidv7();
    const deleted = await run({
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: metal, unitId },
    });
    expect(deleted.outcome.status).toBe("confirmed");
    const rows = await t.db.select().from(containers);
    expect(rows.every((row) => row.trashUnitId === unitId && row.trashedAt !== null)).toBe(true);
    // The entry stays stored for recovery, but isn't effective.
    expect(await t.db.select().from(memberships)).toHaveLength(1);
    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.containers).toEqual([]);
    expect(snapshot.memberships).toEqual([]);
    expect(snapshot.positions).toMatchObject([{ viewKey: "unsorted", itemId: dopesmoker }]);
    expect(snapshot.trashUnits).toMatchObject([
      { id: unitId, kind: "folder", rootId: metal, name: "Metal", folders: 0, lists: 1 },
    ]);

    const recovered = await run({ mutationId: uuidv7(), name: "trash.recover", args: { unitId } });
    expect(recovered.outcome.status).toBe("confirmed");
    const back = await bootstrapSnapshot(t.db, anna.userId);
    expect(back.containers.map((row) => row.id).toSorted()).toEqual([metal, doom].toSorted());
    expect(back.memberships).toMatchObject([{ listId: doom, albumId: dopesmoker }]);
    expect(back.positions).toEqual([]);
    expect(back.trashUnits).toEqual([]);
    expect(await t.db.select().from(trashUnits)).toEqual([]);
  });

  test("a list deleted on its own keeps its unit and date when its folder goes, and asks where to go", async () => {
    const metal = await create("folder", "Metal");
    const doom = await create("list", "Doom", metal);
    const doomUnit = uuidv7();
    await run({
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: doom, unitId: doomUnit },
    });
    const [before] = await t.db.select().from(containers).where(eq(containers.id, doom));
    await run({
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: metal, unitId: uuidv7() },
    });
    const [after] = await t.db.select().from(containers).where(eq(containers.id, doom));
    expect(after?.trashUnitId).toBe(doomUnit);
    expect(after?.trashedAt).toEqual(before?.trashedAt ?? null);

    const asked = await run({
      mutationId: uuidv7(),
      name: "trash.recover",
      args: { unitId: doomUnit },
    });
    expect(asked.outcome).toMatchObject({ status: "needs_input", need: "destination" });
    const toRoot = await run({
      mutationId: uuidv7(),
      name: "trash.recover",
      args: { unitId: doomUnit, parentId: null },
    });
    expect(toRoot.outcome.status).toBe("confirmed");
    const [doomNow] = await t.db.select().from(containers).where(eq(containers.id, doom));
    expect(doomNow).toMatchObject({ parentId: null, trashedAt: null, trashUnitId: null });
  });
});
