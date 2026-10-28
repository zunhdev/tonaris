// Trash for folders and lists against an in-memory store (FR-01.11 to FR-01.16, TS-13, TS-26): deletion as one unit,
// Unsorted placement, a resend, recovery to the parent or a chosen destination and name, and the questions recovery
// asks. Property tests check unit semantics over random trees and deletions: content deleted together is one unit,
// content deleted separately keeps its own unit and dates, and recovering a unit restores exactly its members.

import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

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
