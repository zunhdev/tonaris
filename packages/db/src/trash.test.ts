// Trash for folders and lists against the local Postgres 18 (FR-01.11 to FR-01.15, TS-13, TS-121): a folder and its
// lists in one unit, their entries kept but out of the bootstrap, Unsorted placement, the unit in the bootstrap, and
// recovery bringing it all back; a list deleted on its own keeps its unit when its folder goes too.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import { albums, containers, memberships, trashUnits, users } from "./schema";
import { bootstrapSnapshot, executeMutation, purgeExpiredTrash, readChanges } from "./sync";
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

async function newAlbum(title: string, mbReleaseGroupId: string | null = null) {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId: anna.userId,
    title,
    artistCredit: "Sleep",
    originalYear: 1999,
    searchTitleKey: title.toLowerCase(),
    searchArtistKey: "sleep",
    mbReleaseGroupId,
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

describe("albums in Trash, in Postgres (FR-14.1 to FR-14.3)", () => {
  test("a deleted album leaves the bootstrap with its entries, and comes back to its active lists", async () => {
    const doom = await create("list", "Doom");
    const later = await create("list", "Later");
    const dopesmoker = await newAlbum("Dopesmoker");
    for (const listId of [doom, later]) {
      // oxlint-disable-next-line no-await-in-loop
      await run({
        mutationId: uuidv7(),
        name: "membership.add",
        args: { listId, albumId: dopesmoker },
      });
    }
    const unitId = uuidv7();
    const deleted = await run({
      mutationId: uuidv7(),
      name: "album.delete",
      args: { id: dopesmoker, unitId },
    });
    expect(deleted.outcome.status).toBe("confirmed");
    const gone = await bootstrapSnapshot(t.db, anna.userId);
    expect(gone.albums).toEqual([]);
    expect(gone.memberships).toEqual([]);
    expect(gone.trashUnits).toMatchObject([{ id: unitId, kind: "album", name: "Dopesmoker" }]);
    expect(await t.db.select().from(memberships)).toHaveLength(2);

    await run({
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: later, unitId: uuidv7() },
    });
    const restored = await run({ mutationId: uuidv7(), name: "trash.recover", args: { unitId } });
    expect(restored.outcome).toMatchObject({
      status: "confirmed",
      result: { skipped: [{ listId: later, listName: "Later", reason: "list_in_trash" }] },
    });
    const back = await bootstrapSnapshot(t.db, anna.userId);
    expect(back.albums.map((album) => album.id)).toEqual([dopesmoker]);
    expect(back.memberships).toMatchObject([{ listId: doom, albumId: dopesmoker }]);
    expect(back.trashUnits.map((unit) => unit.kind)).toEqual(["list"]);
  });

  test("an active album of the same release group pauses the restore, changing nothing", async () => {
    const releaseGroup = uuidv7();
    const first = await newAlbum("Dopesmoker", releaseGroup);
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "album.delete", args: { id: first, unitId } });
    const again = await newAlbum("Dopesmoker", releaseGroup);
    const paused = await run({ mutationId: uuidv7(), name: "trash.recover", args: { unitId } });
    expect(paused.outcome).toMatchObject({
      status: "needs_input",
      need: "match",
      candidates: [{ unitId, albumId: again, title: "Dopesmoker" }],
    });
    const [still] = await t.db.select().from(albums).where(eq(albums.id, first));
    expect(still?.trashUnitId).toBe(unitId);
  });
});

describe("removing Trash for good, in Postgres (FR-01.17, FR-01.18, TS-91)", () => {
  test("an early purge removes a unit's rows, its entries cascading, and keeps active albums", async () => {
    const doom = await create("list", "Doom");
    const dopesmoker = await newAlbum("Dopesmoker");
    await run({
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: doom, albumId: dopesmoker },
    });
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "container.delete", args: { id: doom, unitId } });
    const purged = await run({
      mutationId: uuidv7(),
      name: "trash.purge",
      args: { unitIds: [unitId] },
    });
    expect(purged.outcome).toMatchObject({
      status: "confirmed",
      result: { purged: [unitId], gone: [] },
    });
    expect(await t.db.select().from(containers)).toEqual([]);
    expect(await t.db.select().from(memberships)).toEqual([]);
    expect(await t.db.select().from(trashUnits)).toEqual([]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).albums.map((album) => album.id)).toEqual([
      dopesmoker,
    ]);
  });

  test("the expiry purges units past 30 days only, logging their removal without a mutation", async () => {
    const doom = await create("list", "Doom");
    const later = await create("list", "Later");
    const [old, recent] = [uuidv7(), uuidv7()];
    await run({ mutationId: uuidv7(), name: "container.delete", args: { id: doom, unitId: old } });
    await run({
      mutationId: uuidv7(),
      name: "container.delete",
      args: { id: later, unitId: recent },
    });
    // Doom's unit is past its expiry.
    await t.db
      .update(trashUnits)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(trashUnits.id, old));
    const { seq } = await bootstrapSnapshot(t.db, anna.userId);

    const purged = await purgeExpiredTrash(t.db, new Date());
    expect(purged).toMatchObject([
      {
        accountId: anna.userId,
        changes: [{ entity: "trashUnit", id: old, op: "delete", mutationId: null }],
      },
    ]);
    expect((await t.db.select().from(trashUnits)).map((unit) => unit.id)).toEqual([recent]);
    expect(await readChanges(t.db, anna.userId, seq, 10)).toMatchObject([
      { entity: "trashUnit", id: old, op: "delete" },
    ]);
    expect(await purgeExpiredTrash(t.db, new Date())).toEqual([]);
  });
});
