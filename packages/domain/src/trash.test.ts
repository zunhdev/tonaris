// Trash for folders and lists against an in-memory store (FR-01.11 to FR-01.16, TS-13, TS-26): deletion as one unit,
// Unsorted placement, a resend, recovery to the parent or a chosen destination and name, the questions recovery
// asks, and a Read-only agent's refusals. Property tests check unit semantics over random trees and deletions: content deleted together is one unit,
// content deleted separately keeps its own unit and dates, and recovering a unit restores exactly its members.

import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";
import { sameAlbumSchema } from "./trash";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };

const container = (
  kind: StoredContainer["kind"],
  name: string,
  parentId: string | null = null,
): StoredContainer => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  ownerId: owner,
  trashed: false,
});

const album = (title: string) => ({
  id: uuidv7(),
  title,
  artistCredit: "Sleep",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1999,
  recordingYearStart: null,
  recordingYearEnd: null,
  ownerId: owner,
});

function setup(
  containers: StoredContainer[],
  extra: Omit<Parameters<typeof memoryStore>[0] & object, "containers"> = {},
) {
  const context = memoryStore({ ...extra, containers });
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const run = async (mutation: Mutation): Promise<CommandResult> => {
    clock += 60_000;
    const parsed = mutationSchema.parse(mutation);
    const result = await runCommand(parsed, {
      principal: anna,
      store: context.store,
      now: new Date(clock),
    });
    if (result.status === "applied") {
      for (const change of result.changes) {
        changeSchema.parse({ ...change, seq: 1, mutationId: parsed.mutationId });
      }
    }
    return result;
  };
  return { ...context, run };
}

const remove = (id: string, unitId = uuidv7()): Mutation => ({
  mutationId: uuidv7(),
  name: "container.delete",
  args: { id, unitId },
});
const recover = (unitId: string, choice: { parentId?: string | null; name?: string } = {}) =>
  ({
    mutationId: uuidv7(),
    name: "trash.recover",
    args: { unitId, ...choice },
  }) satisfies Mutation;

describe("deleting folders and lists (FR-01.11, FR-01.13)", () => {
  test("a folder goes to Trash with its active descendants, as one unit expiring in 30 days", async () => {
    const metal = container("folder", "Metal");
    const doom = container("list", "Doom", metal.id);
    const sludge = container("folder", "Sludge", metal.id);
    const crust = container("list", "Crust", sludge.id);
    const later = container("list", "Later");
    const { run, containers, trashUnits } = setup([metal, doom, sludge, crust, later]);
    const unitId = uuidv7();
    const result = await run(remove(metal.id, unitId));
    expect(result).toMatchObject({ status: "applied" });
    const changes = result.status === "applied" ? result.changes : [];
    expect(changes.filter((change) => change.entity === "container").map((c) => c.id)).toEqual([
      metal.id,
      doom.id,
      sludge.id,
      crust.id,
    ]);
    expect(changes.at(-1)).toMatchObject({
      entity: "trashUnit",
      op: "insert",
      data: { id: unitId, kind: "folder", rootId: metal.id, name: "Metal", folders: 1, lists: 2 },
    });
    const unit = trashUnits.get(unitId);
    expect((unit?.expiresAt.getTime() ?? 0) - (unit?.deletedAt.getTime() ?? 0)).toBe(
      30 * 86_400_000,
    );
    expect([metal, doom, sludge, crust].every((each) => containers.get(each.id)?.trashed)).toBe(
      true,
    );
    expect(containers.get(later.id)?.trashed).toBe(false);
  });

  test("an album in no other active list enters Unsorted, at its top; one in another list stays", async () => {
    const doom = container("list", "Doom");
    const later = container("list", "Later");
    const [dopesmoker, holy] = [album("Dopesmoker"), album("Holy Mountain")];
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run } = setup([doom, later], {
      albums: [dopesmoker, holy],
      memberships: [
        { listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner },
        { listId: doom.id, albumId: holy.id, addedAt, ownerId: owner },
        { listId: later.id, albumId: holy.id, addedAt, ownerId: owner },
      ],
      positions: [{ viewKey: "unsorted", itemId: uuidv7(), key: "a0", personId: owner }],
    });
    const result = await run(remove(doom.id));
    const changes = result.status === "applied" ? result.changes : [];
    expect(changes.filter((change) => change.entity === "membership")).toHaveLength(2);
    expect(changes.filter((change) => change.entity === "position")).toEqual([
      expect.objectContaining({
        op: "insert",
        data: expect.objectContaining({ viewKey: "unsorted", itemId: dopesmoker.id }),
      }),
    ]);
  });

  test("a resend changes nothing, a trashed folder can't be deleted again, and a unit ID is the client's", async () => {
    const doom = container("list", "Doom");
    const later = container("list", "Later");
    const { run } = setup([doom, later]);
    const unitId = uuidv7();
    await run(remove(doom.id, unitId));
    expect(await run(remove(doom.id, unitId))).toEqual({ status: "applied", changes: [] });
    expect(await run(remove(doom.id))).toMatchObject({ status: "failed", code: "trashed" });
    expect(await run(remove(later.id, unitId))).toMatchObject({
      status: "failed",
      code: "validation_failed",
    });
  });
});

describe("recovering folders and lists (FR-01.14 to FR-01.16, TS-26)", () => {
  test("a unit returns to its parent, its active albums back in its lists", async () => {
    const metal = container("folder", "Metal");
    const doom = container("list", "Doom", metal.id);
    const dopesmoker = album("Dopesmoker");
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run, containers, trashUnits } = setup([metal, doom], {
      albums: [dopesmoker],
      memberships: [{ listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner }],
    });
    const unitId = uuidv7();
    await run(remove(doom.id, unitId));
    const result = await run(recover(unitId));
    expect(result).toMatchObject({
      status: "applied",
      changes: [
        { entity: "container", id: doom.id, op: "insert", data: { parentId: metal.id } },
        {
          entity: "membership",
          op: "insert",
          data: { listId: doom.id, albumId: dopesmoker.id, addedAt },
        },
        { entity: "position", op: "delete" },
        { entity: "trashUnit", id: unitId, op: "delete" },
      ],
    });
    expect(containers.get(doom.id)?.trashed).toBe(false);
    expect(trashUnits.has(unitId)).toBe(false);
    expect(await run(recover(unitId))).toMatchObject({ status: "failed", code: "not_found" });
  });

  test("only active albums come back; entries of albums in Trash or gone are reported as skipped", async () => {
    const doom = container("list", "Doom");
    const dopesmoker = album("Dopesmoker");
    const holy = { ...album("Holy Mountain"), trashed: true };
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run, trashUnits } = setup([doom], {
      albums: [dopesmoker, holy],
      memberships: [
        { listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner },
        { listId: doom.id, albumId: holy.id, addedAt, ownerId: owner },
      ],
    });
    const unitId = uuidv7();
    await run(remove(doom.id, unitId));
    // An album purged while the unit referred to it leaves a tombstone (TS-13).
    const gone = { id: uuidv7(), title: "Volume One", artist: "Sleep" };
    trashUnits.get(unitId)?.tombstones.push(gone);
    const result = await run(recover(unitId));
    expect(result).toMatchObject({
      status: "applied",
      result: {
        skipped: [
          {
            albumId: holy.id,
            title: "Holy Mountain",
            artist: "Sleep",
            listId: doom.id,
            reason: "album_in_trash",
          },
          { albumId: gone.id, title: "Volume One", listId: null, reason: "album_deleted" },
        ],
      },
    });
    const changes = result.status === "applied" ? result.changes : [];
    expect(changes.filter((change) => change.entity === "membership")).toMatchObject([
      { data: { albumId: dopesmoker.id } },
    ]);
  });

  test("a parent in Trash, or gone, asks for a destination; a chosen one is used", async () => {
    const metal = container("folder", "Metal");
    const doom = container("list", "Doom", metal.id);
    const { run, containers } = setup([metal, doom]);
    const doomUnit = uuidv7();
    await run(remove(doom.id, doomUnit));
    await run(remove(metal.id));
    expect(await run(recover(doomUnit))).toEqual({
      status: "needs_input",
      need: "destination",
      candidates: [{ unitId: doomUnit, name: "Doom", parentId: metal.id, reason: "trashed" }],
    });
    expect(containers.get(doom.id)?.trashed).toBe(true);
    expect(await run(recover(doomUnit, { parentId: null }))).toMatchObject({ status: "applied" });
    expect(containers.get(doom.id)).toMatchObject({ parentId: null, trashed: false });
  });

  test("a taken name asks for another; the one given is used", async () => {
    const doom = container("list", "Doom");
    const { run, containers } = setup([doom]);
    const unitId = uuidv7();
    await run(remove(doom.id, unitId));
    await run({
      mutationId: uuidv7(),
      name: "container.create",
      args: { id: uuidv7(), kind: "list", parentId: null, name: "doom" },
    });
    expect(await run(recover(unitId))).toEqual({
      status: "needs_input",
      need: "name",
      candidates: [{ unitId, name: "Doom", parentId: null }],
    });
    expect(await run(recover(unitId, { name: "DOOM" }))).toMatchObject({
      status: "needs_input",
      need: "name",
    });
    expect(await run(recover(unitId, { name: "Doom (old)" }))).toMatchObject({
      status: "applied",
    });
    expect(containers.get(doom.id)).toMatchObject({ name: "Doom (old)", trashed: false });
  });
});

describe("unit semantics, as properties (FR-01.13)", () => {
  /** A forest of folders and lists: each one's parent is an earlier folder, or the root. */
  const forest = fc
    .array(fc.record({ folder: fc.boolean(), parent: fc.option(fc.nat(), { nil: null }) }), {
      minLength: 1,
      maxLength: 14,
    })
    .map((shape) => {
      const made: StoredContainer[] = [];
      for (const [index, each] of shape.entries()) {
        const folders = made.filter((one) => one.kind === "folder");
        const parent =
          each.parent === null || folders.length === 0
            ? null
            : (folders[each.parent % folders.length]?.id ?? null);
        made.push(container(each.folder ? "folder" : "list", `C${index}`, parent));
      }
      return made;
    });
  const steps = fc.array(fc.record({ recover: fc.boolean(), pick: fc.nat() }), { maxLength: 24 });

  test("units are disjoint, keep their own members and dates, and recover exactly those", async () => {
    await fc.assert(
      fc.asyncProperty(forest, steps, async (tree, plan) => {
        const { run, containers, trashUnits, unitOf } = setup(tree);
        /** Each unit's members and deletion time, as deleted. */
        const deleted = new Map<string, { members: Set<string>; at: number }>();

        for (const step of plan) {
          if (step.recover && deleted.size > 0) {
            const unitId = [...deleted.keys()][step.pick % deleted.size]!;
            // Into the root under a fresh name, so recovery never has to ask.
            // oxlint-disable-next-line no-await-in-loop
            const result = await run(recover(unitId, { parentId: null, name: uuidv7() }));
            expect(result.status).toBe("applied");
            // Exactly its members return; other units stay as they were.
            for (const id of deleted.get(unitId)!.members) {
              expect(containers.get(id)?.trashed).toBe(false);
            }
            deleted.delete(unitId);
          } else {
            const active = [...containers.values()].filter((each) => !each.trashed);
            if (active.length === 0) continue;
            const target = active[step.pick % active.length]!;
            const before = new Map([...containers.values()].map((each) => [each.id, each.trashed]));
            const unitId = uuidv7();
            // oxlint-disable-next-line no-await-in-loop
            const result = await run(remove(target.id, unitId));
            expect(result.status).toBe("applied");
            const members = new Set(
              [...containers.values()]
                .filter((each) => each.trashed && !before.get(each.id))
                .map((each) => each.id),
            );
            expect(members.has(target.id)).toBe(true);
            deleted.set(unitId, {
              members,
              at: trashUnits.get(unitId)?.deletedAt.getTime() ?? 0,
            });
          }

          // Every trashed container is in exactly the unit it was deleted with, which keeps its date.
          for (const each of containers.values()) {
            const unit = unitOf.get(each.id);
            expect(each.trashed).toBe(unit !== undefined);
            if (unit) expect(deleted.get(unit)?.members.has(each.id)).toBe(true);
          }
          for (const [unitId, { at }] of deleted) {
            expect(trashUnits.get(unitId)?.deletedAt.getTime()).toBe(at);
          }
          // Units are disjoint.
          const sizes = [...deleted.values()].reduce((sum, unit) => sum + unit.members.size, 0);
          const distinct = new Set<string>();
          for (const unit of deleted.values()) for (const id of unit.members) distinct.add(id);
          expect(distinct.size).toBe(sizes);
        }
      }),
      { numRuns: 60 },
    );
  });
});

const deleteAlbum = (id: string, unitId = uuidv7()): Mutation => ({
  mutationId: uuidv7(),
  name: "album.delete",
  args: { id, unitId },
});

describe("deleting and restoring albums (FR-14.1 to FR-14.3)", () => {
  test("an album leaves its lists as its own unit, keeping its entries; restored, it returns to active lists", async () => {
    const doom = container("list", "Doom");
    const later = container("list", "Later");
    const dopesmoker = { ...album("Dopesmoker"), releaseGroupId: uuidv7() };
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run, albums, memberships, trashUnits } = setup([doom, later], {
      albums: [dopesmoker],
      memberships: [
        { listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner },
        { listId: later.id, albumId: dopesmoker.id, addedAt, ownerId: owner },
      ],
      positions: [{ viewKey: doom.id, itemId: dopesmoker.id, key: "a0", personId: owner }],
    });
    const unitId = uuidv7();
    const deleted = await run(deleteAlbum(dopesmoker.id, unitId));
    expect(deleted).toMatchObject({
      status: "applied",
      changes: [
        { entity: "album", id: dopesmoker.id, op: "delete" },
        { entity: "membership", op: "delete" },
        { entity: "membership", op: "delete" },
        { entity: "position", op: "delete" },
        {
          entity: "trashUnit",
          op: "insert",
          data: { id: unitId, kind: "album", name: "Dopesmoker", parentId: null },
        },
      ],
    });
    expect(albums.get(dopesmoker.id)?.trashed).toBe(true);
    expect(memberships.size).toBe(2);
    expect(await run(deleteAlbum(dopesmoker.id, unitId))).toEqual({
      status: "applied",
      changes: [],
    });

    // Later goes to Trash meanwhile: restoring skips it, with its name.
    await run(remove(later.id));
    const restored = await run(recover(unitId));
    expect(restored).toMatchObject({
      status: "applied",
      result: {
        skipped: [
          { albumId: dopesmoker.id, listId: later.id, listName: "Later", reason: "list_in_trash" },
        ],
      },
      changes: [
        { entity: "album", id: dopesmoker.id, op: "insert", data: { title: "Dopesmoker" } },
        { entity: "membership", op: "insert", data: { listId: doom.id } },
        { entity: "trashUnit", id: unitId, op: "delete" },
      ],
    });
    expect(albums.get(dopesmoker.id)?.trashed).toBe(false);
    expect(trashUnits.has(unitId)).toBe(false);
  });

  test("with no active list to return to, a restored album enters Unsorted at its top", async () => {
    const doom = container("list", "Doom");
    const dopesmoker = album("Dopesmoker");
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run } = setup([doom], {
      albums: [dopesmoker],
      memberships: [{ listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner }],
      positions: [{ viewKey: "unsorted", itemId: uuidv7(), key: "a0", personId: owner }],
    });
    const unitId = uuidv7();
    await run(deleteAlbum(dopesmoker.id, unitId));
    await run(remove(doom.id));
    const restored = await run(recover(unitId));
    expect(restored).toMatchObject({ status: "applied" });
    const changes = restored.status === "applied" ? restored.changes : [];
    expect(changes).toContainEqual(
      expect.objectContaining({
        entity: "position",
        op: "insert",
        data: expect.objectContaining({ viewKey: "unsorted", itemId: dopesmoker.id }),
      }),
    );
  });

  test("an active album of the same release group pauses the restore, and nothing changes", async () => {
    const releaseGroupId = uuidv7();
    const first = { ...album("Dopesmoker"), releaseGroupId };
    const again = { ...album("Dopesmoker (again)"), releaseGroupId };
    // Another active record of the same album: one captured again while the first was in Trash.
    const { run, albums, trashUnits } = setup([], { albums: [first, again] });
    const unitId = uuidv7();
    await run(deleteAlbum(first.id, unitId));
    const paused = await run(recover(unitId));
    expect(paused).toEqual({
      status: "needs_input",
      need: "match",
      candidates: [
        {
          unitId,
          albumId: again.id,
          title: "Dopesmoker (again)",
          artistCredit: "Sleep",
          originalYear: 1999,
        },
      ],
    });
    expect(albums.get(first.id)?.trashed).toBe(true);
    expect(trashUnits.has(unitId)).toBe(true);
    // Clients read the candidates with the domain's schema.
    const candidates = paused.status === "needs_input" ? paused.candidates : [];
    expect(sameAlbumSchema.array().parse(candidates)).toEqual(candidates);
  });
});

const purge = (...unitIds: string[]): Mutation => ({
  mutationId: uuidv7(),
  name: "trash.purge",
  args: { unitIds },
});

describe("removing Trash for good (FR-01.17, FR-01.18, FR-14.5, TS-13)", () => {
  test("a purged list goes with its entries; its albums stay, and one in Trash keeps a tombstone of it", async () => {
    const doom = container("list", "Doom");
    const [kept, trashed] = [album("Dopesmoker"), album("Holy Mountain")];
    const addedAt = "2026-10-28T12:00:00.000Z";
    const { run, containers, memberships, albums, trashUnits } = setup([doom], {
      albums: [kept, trashed],
      memberships: [
        { listId: doom.id, albumId: kept.id, addedAt, ownerId: owner },
        { listId: doom.id, albumId: trashed.id, addedAt, ownerId: owner },
      ],
    });
    const albumUnit = uuidv7();
    await run(deleteAlbum(trashed.id, albumUnit));
    const listUnit = uuidv7();
    await run(remove(doom.id, listUnit));
    const gone = uuidv7();
    expect(await run(purge(listUnit, gone))).toMatchObject({
      status: "applied",
      result: { purged: [listUnit], gone: [gone] },
      changes: [{ entity: "trashUnit", id: listUnit, op: "delete" }],
    });
    expect(containers.has(doom.id)).toBe(false);
    expect(memberships.size).toBe(0);
    expect(albums.get(kept.id)?.trashed).toBe(false);
    expect(trashUnits.get(albumUnit)?.tombstones).toEqual([
      { kind: "list", id: doom.id, name: "Doom" },
    ]);

    // Restoring the album reports the list it can't go back to.
    expect(await run(recover(albumUnit))).toMatchObject({
      status: "applied",
      result: { skipped: [{ listId: doom.id, listName: "Doom", reason: "list_deleted" }] },
    });
  });

  test("a purged album goes with its links and values, and a list's unit keeps a tombstone of it", async () => {
    const doom = container("list", "Doom");
    const dopesmoker = album("Dopesmoker");
    const addedAt = "2026-10-28T12:00:00.000Z";
    const fieldId = uuidv7();
    const { run, albums, links, fieldValues, trashUnits } = setup([doom], {
      albums: [dopesmoker],
      memberships: [{ listId: doom.id, albumId: dopesmoker.id, addedAt, ownerId: owner }],
      links: [
        {
          albumId: dopesmoker.id,
          service: "spotify",
          url: "https://open.spotify.com/album/1",
          entityId: "1",
        },
      ],
      fields: [{ id: fieldId, name: "Rating", type: "number", options: [], ownerId: owner }],
      fieldValues: [{ albumId: dopesmoker.id, fieldId, value: "5" }],
    });
    const listUnit = uuidv7();
    await run(remove(doom.id, listUnit));
    const albumUnit = uuidv7();
    await run(deleteAlbum(dopesmoker.id, albumUnit));
    const result = await run(purge(albumUnit));
    expect(result).toMatchObject({
      status: "applied",
      changes: [
        { entity: "link", id: `${dopesmoker.id}:spotify`, op: "delete" },
        { entity: "fieldValue", id: `${dopesmoker.id}:${fieldId}`, op: "delete" },
        { entity: "trashUnit", id: albumUnit, op: "delete" },
      ],
    });
    expect(albums.has(dopesmoker.id)).toBe(false);
    expect(links.size).toBe(0);
    expect(fieldValues.size).toBe(0);
    expect(trashUnits.get(listUnit)?.tombstones).toEqual([
      { id: dopesmoker.id, title: "Dopesmoker", artist: "Sleep" },
    ]);
  });

  test("purging is app-only", async () => {
    const doom = container("list", "Doom");
    const context = memoryStore({ containers: [doom] });
    const unitId = uuidv7();
    await runCommand(mutationSchema.parse(remove(doom.id, unitId)), {
      principal: anna,
      store: context.store,
    });
    const agent: Principal = { kind: "mcp", userId: owner, grantId: uuidv7(), mode: "manage" };
    expect(
      await runCommand(mutationSchema.parse(purge(unitId)), {
        principal: agent,
        store: context.store,
      }),
    ).toMatchObject({ status: "failed", code: "app_only" });
    expect(context.trashUnits.has(unitId)).toBe(true);
  });
});

describe("the connection's mode (FR-10.3, TS-30)", () => {
  const readOnly: Principal = { kind: "mcp", userId: owner, grantId: uuidv7(), mode: "read_only" };
  const someoneElse: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };

  test("a Read-only agent can't recover its user's list or album, which stay in Trash", async () => {
    const doom = container("list", "Doom");
    const dopesmoker = album("Dopesmoker");
    const { run, store, albums, containers, trashUnits } = setup([doom], { albums: [dopesmoker] });
    const [listUnit, albumUnit] = [uuidv7(), uuidv7()];
    await run(remove(doom.id, listUnit));
    await run(deleteAlbum(dopesmoker.id, albumUnit));
    const as = (principal: Principal, mutation: Mutation) =>
      runCommand(mutationSchema.parse(mutation), { principal, store });

    for (const unitId of [listUnit, albumUnit]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await as(readOnly, recover(unitId))).toMatchObject({
        status: "failed",
        code: "permission_denied",
      });
      // Someone else's unit is answered as gone, whatever their rights.
      // oxlint-disable-next-line no-await-in-loop
      expect(await as(someoneElse, recover(unitId))).toMatchObject({
        status: "failed",
        code: "not_found",
      });
      expect(trashUnits.has(unitId)).toBe(true);
    }
    expect(containers.get(doom.id)?.trashed).toBe(true);
    expect(albums.get(dopesmoker.id)?.trashed).toBe(true);
  });

  test("a Read-only agent's resend of a deletion is refused, not answered as applied", async () => {
    const doom = container("list", "Doom");
    const dopesmoker = album("Dopesmoker");
    const { run, store } = setup([doom], { albums: [dopesmoker] });
    const [listUnit, albumUnit] = [uuidv7(), uuidv7()];
    await run(remove(doom.id, listUnit));
    await run(deleteAlbum(dopesmoker.id, albumUnit));
    const asAgent = (mutation: Mutation) =>
      runCommand(mutationSchema.parse(mutation), { principal: readOnly, store });

    expect(await asAgent(remove(doom.id, listUnit))).toMatchObject({
      status: "failed",
      code: "permission_denied",
    });
    expect(await asAgent(deleteAlbum(dopesmoker.id, albumUnit))).toMatchObject({
      status: "failed",
      code: "permission_denied",
    });
    // The owner's own resend still changes nothing.
    expect(await run(remove(doom.id, listUnit))).toEqual({ status: "applied", changes: [] });
  });
});
