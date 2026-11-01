// Manual order against an in-memory store (TS-16, FR-05.2–FR-05.4, FR-09.4): `order.set` with field-level CAS per
// item, and DS-51's placement kept by the commands that bring items into views or take them out. The database layer
// runs the same commands inside the owner's write lock (TS-20).

import { describe, expect, test } from "bun:test";

import type { Album } from "./albums";
import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import { membershipKey } from "./memberships";
import { isOrderKey, planMoves } from "./positions";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore, positionRowKey } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };

const album = (title: string): Album & { ownerId: string } => ({
  id: uuidv7(),
  title,
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1986,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ownerId: owner,
});

const container = (kind: StoredContainer["kind"], name: string, parentId: string | null = null) =>
  ({
    id: uuidv7(),
    kind,
    parentId,
    name,
    description: null,
    ownerId: owner,
    trashed: false,
  }) satisfies StoredContainer;

const order = (
  viewKey: string,
  keys: Record<string, string | null>,
  base: Record<string, string | null>,
): Mutation =>
  mutationSchema.parse({ mutationId: uuidv7(), name: "order.set", args: { viewKey, keys }, base });

const entry = (name: "membership.add" | "membership.remove", listId: string, albumId: string) =>
  mutationSchema.parse({ mutationId: uuidv7(), name, args: { listId, albumId } });

/** The changes, checked against the stream's schema as the database layer will log them. */
function changesOf(result: CommandResult) {
  expect(result.status).toBe("applied");
  if (result.status !== "applied") return [];
  for (const change of result.changes) changeSchema.parse({ ...change, seq: 1, mutationId: null });
  return result.changes;
}

function failed(result: CommandResult) {
  expect(result.status).toBe("failed");
  return result.status === "failed" ? result : undefined;
}

/** A list holding `albums`, each entered in order. */
function listOf(...albums: (Album & { ownerId: string })[]) {
  const doom = container("list", "Doom");
  const memory = memoryStore({
    albums,
    containers: [doom],
    memberships: albums.map((each, index) => ({
      listId: doom.id,
      albumId: each.id,
      ownerId: owner,
      addedAt: new Date(Date.UTC(2026, 9, 23, 9, index)).toISOString(),
    })),
  });
  return {
    doom,
    memory,
    run: (mutation: Mutation) => runCommand(mutation, { principal: anna, store: memory.store }),
  };
}

describe("order.set (TS-16, FR-05.2)", () => {
  test("sets and clears keys in one move, each logged as a position change", async () => {
    const nightfall = album("Nightfall");
    const dreams = album("Ancient Dreams");
    const { doom, memory, run } = listOf(nightfall, dreams);
    const placed = await run(
      order(
        doom.id,
        { [dreams.id]: "a0", [nightfall.id]: "a1" },
        { [dreams.id]: null, [nightfall.id]: null },
      ),
    );
    expect(changesOf(placed)).toEqual([
      {
        entity: "position",
        id: `${doom.id}:${dreams.id}`,
        op: "insert",
        data: { viewKey: doom.id, itemId: dreams.id, key: "a0" },
      },
      {
        entity: "position",
        id: `${doom.id}:${nightfall.id}`,
        op: "insert",
        data: { viewKey: doom.id, itemId: nightfall.id, key: "a1" },
      },
    ]);

    const moved = await run(
      order(
        doom.id,
        { [dreams.id]: "a2", [nightfall.id]: null },
        { [dreams.id]: "a0", [nightfall.id]: "a1" },
      ),
    );
    expect(changesOf(moved).map((change) => change.op)).toEqual(["update", "delete"]);
    expect(memory.positions.get(positionRowKey(owner, doom.id, dreams.id))?.key).toBe("a2");
    expect(memory.positions.has(positionRowKey(owner, doom.id, nightfall.id))).toBe(false);
  });

  test("the same item moved from a stale place is a conflict, and nothing changes (FR-09.4)", async () => {
    const nightfall = album("Nightfall");
    const dreams = album("Ancient Dreams");
    const { doom, memory, run } = listOf(nightfall, dreams);
    await run(order(doom.id, { [nightfall.id]: "a0" }, { [nightfall.id]: null }));
    const stale = await run(
      order(
        doom.id,
        { [nightfall.id]: "a5", [dreams.id]: "a6" },
        { [nightfall.id]: null, [dreams.id]: null },
      ),
    );
    expect(stale).toEqual({
      status: "conflict",
      conflicts: [{ field: nightfall.id, current: "a0", attempted: "a5", base: null }],
    });
    expect(memory.positions.has(positionRowKey(owner, doom.id, dreams.id))).toBe(false);
  });

  test("different items moved from two sessions both apply (FR-09.4)", async () => {
    const nightfall = album("Nightfall");
    const dreams = album("Ancient Dreams");
    const { doom, run } = listOf(nightfall, dreams);
    expect(
      changesOf(await run(order(doom.id, { [nightfall.id]: "a0" }, { [nightfall.id]: null }))),
    ).toHaveLength(1);
    expect(
      changesOf(await run(order(doom.id, { [dreams.id]: "Zz" }, { [dreams.id]: null }))),
    ).toHaveLength(1);
  });

  test("an item no longer in the view is refused", async () => {
    const nightfall = album("Nightfall");
    const elsewhere = album("Tales of Creation");
    const { doom, run } = listOf(nightfall);
    const result = failed(
      await run(order(doom.id, { [elsewhere.id]: "a0" }, { [elsewhere.id]: null })),
    );
    expect(result?.code).toBe("not_found");
  });

  test("keys that aren't fractional-index keys are refused", async () => {
    const nightfall = album("Nightfall");
    const { doom, run } = listOf(nightfall);
    const result = failed(
      await run(order(doom.id, { [nightfall.id]: "a10" }, { [nightfall.id]: null })),
    );
    expect(result?.problem.errors).toEqual([
      { path: `args.keys.${nightfall.id}`, message: "Not a fractional-index key" },
    ]);
    expect(isOrderKey("a0V")).toBe(true);
    expect(isOrderKey("")).toBe(false);
  });

  test("another person's list and base naming other items are refused", async () => {
    const nightfall = album("Nightfall");
    const { doom, memory } = listOf(nightfall);
    const theirs = failed(
      await runCommand(order(doom.id, { [nightfall.id]: "a0" }, { [nightfall.id]: null }), {
        principal: ben,
        store: memory.store,
      }),
    );
    expect(theirs?.code).toBe("not_found");
    const unbased = failed(
      await runCommand(order(doom.id, { [nightfall.id]: "a0" }, { [uuidv7()]: null }), {
        principal: anna,
        store: memory.store,
      }),
    );
    expect(unbased?.code).toBe("validation_failed");
  });

  test("folders and the root take their active folders and lists", async () => {
    const metal = container("folder", "Metal");
    const doom = container("list", "Doom", metal.id);
    const later = container("list", "Later");
    const memory = memoryStore({ containers: [metal, doom, later] });
    const run = (mutation: Mutation) =>
      runCommand(mutation, { principal: anna, store: memory.store });
    expect(
      changesOf(await run(order("root", { [later.id]: "Zz" }, { [later.id]: null }))),
    ).toHaveLength(1);
    expect(failed(await run(order("root", { [doom.id]: "a0" }, { [doom.id]: null })))?.code).toBe(
      "not_found",
    );
    expect(
      changesOf(await run(order(metal.id, { [doom.id]: "a0" }, { [doom.id]: null }))),
    ).toHaveLength(1);
  });

  test("the same keys change nothing", async () => {
    const nightfall = album("Nightfall");
    const { doom, run } = listOf(nightfall);
    await run(order(doom.id, { [nightfall.id]: "a0" }, { [nightfall.id]: null }));
    expect(
      changesOf(await run(order(doom.id, { [nightfall.id]: "a0" }, { [nightfall.id]: "a0" }))),
    ).toEqual([]);
  });
});

describe("placement (DS-51)", () => {
  test("a new album enters arranged Unsorted at the top; unarranged, it writes nothing", async () => {
    const memory = memoryStore();
    const run = (mutation: Mutation) =>
      runCommand(mutation, { principal: anna, store: memory.store });
    const first = album("Nightfall");
    const second = album("Ancient Dreams");
    const { ownerId: _, ...firstArgs } = first;
    const { ownerId: __, ...secondArgs } = second;
    // Unarranged, Unsorted's fallback order, newest first, already puts a new album at the top.
    const unarranged = await run({ mutationId: uuidv7(), name: "album.create", args: firstArgs });
    expect(changesOf(unarranged)).toHaveLength(1);
    await run(order("unsorted", { [first.id]: "a0" }, { [first.id]: null }));
    const arranged = await run({ mutationId: uuidv7(), name: "album.create", args: secondArgs });
    expect(changesOf(arranged)[1]).toEqual({
      entity: "position",
      id: `unsorted:${second.id}`,
      op: "insert",
      data: { viewKey: "unsorted", itemId: second.id, key: "Zz" },
    });
    expect(memory.positions.get(positionRowKey(owner, "unsorted", first.id))?.key).toBe("a0");
  });

  test("joining a list leaves Unsorted's place behind; leaving the last list returns to the top", async () => {
    const nightfall = album("Nightfall");
    const dreams = album("Ancient Dreams");
    const doom = container("list", "Doom");
    const memory = memoryStore({
      albums: [nightfall, dreams],
      containers: [doom],
      positions: [
        { personId: owner, viewKey: "unsorted", itemId: nightfall.id, key: "a0" },
        { personId: owner, viewKey: "unsorted", itemId: dreams.id, key: "a1" },
      ],
    });
    const run = (mutation: Mutation) =>
      runCommand(mutation, { principal: anna, store: memory.store });

    const added = changesOf(await run(entry("membership.add", doom.id, dreams.id)));
    expect(added.slice(1)).toEqual([
      { entity: "position", id: `unsorted:${dreams.id}`, op: "delete", data: null },
    ]);
    await run(order(doom.id, { [dreams.id]: "a0" }, { [dreams.id]: null }));

    const removed = changesOf(await run(entry("membership.remove", doom.id, dreams.id)));
    expect(removed).toEqual([
      { entity: "membership", id: membershipKey(doom.id, dreams.id), op: "delete", data: null },
      { entity: "position", id: `${doom.id}:${dreams.id}`, op: "delete", data: null },
      {
        entity: "position",
        id: `unsorted:${dreams.id}`,
        op: "insert",
        data: { viewKey: "unsorted", itemId: dreams.id, key: "Zz" },
      },
    ]);
  });

  test("leaving one of several lists keeps the album out of Unsorted", async () => {
    const nightfall = album("Nightfall");
    const doom = container("list", "Doom");
    const later = container("list", "Later");
    const memory = memoryStore({
      albums: [nightfall],
      containers: [doom, later],
      memberships: [doom, later].map((each) => ({
        listId: each.id,
        albumId: nightfall.id,
        ownerId: owner,
        addedAt: "2026-10-23T09:00:00.000Z",
      })),
    });
    const removed = changesOf(
      await runCommand(entry("membership.remove", doom.id, nightfall.id), {
        principal: anna,
        store: memory.store,
      }),
    );
    expect(removed.map((change) => change.entity)).toEqual(["membership"]);
  });

  test("a moved folder or list leaves its place in the old parent", async () => {
    const metal = container("folder", "Metal");
    const doom = container("list", "Doom");
    const memory = memoryStore({
      containers: [metal, doom],
      positions: [{ personId: owner, viewKey: "root", itemId: doom.id, key: "a0" }],
    });
    const moved = changesOf(
      await runCommand(
        mutationSchema.parse({
          mutationId: uuidv7(),
          name: "container.move",
          args: { id: doom.id, parentId: metal.id },
          base: { parentId: null },
        }),
        { principal: anna, store: memory.store },
      ),
    );
    expect(moved.slice(1)).toEqual([
      { entity: "position", id: `root:${doom.id}`, op: "delete", data: null },
    ]);
    expect(memory.positions.size).toBe(0);
  });
});

describe("planning a move of several items (TS-16)", () => {
  /** The view's order after `writes`: arranged items by key, then the rest as `sequence` has them. */
  const after = (sequence: string[], keys: Map<string, string>, writes: Map<string, string>) => {
    const merged = new Map([...keys, ...writes]);
    const arranged = sequence
      .filter((id) => merged.has(id))
      .toSorted((a, b) => ((merged.get(a) ?? "") < (merged.get(b) ?? "") ? -1 : 1));
    return [...arranged, ...sequence.filter((id) => !merged.has(id))];
  };
  const arranged = new Map([
    ["a", "a0"],
    ["b", "a1"],
    ["c", "a2"],
    ["d", "a3"],
  ]);
  const sequence = ["a", "b", "c", "d"];

  test("the items come in the order given, the first at the place", () => {
    const top = planMoves(sequence, arranged, ["d", "c"], "top");
    expect(after(sequence, arranged, top)).toEqual(["d", "c", "a", "b"]);
    const behind = planMoves(sequence, arranged, ["a", "b"], { after: "c" });
    expect(after(sequence, arranged, behind)).toEqual(["c", "a", "b", "d"]);
    const before = planMoves(sequence, arranged, ["d", "a"], { before: "c" });
    expect(after(sequence, arranged, before)).toEqual(["b", "d", "a", "c"]);
    for (const writes of [top, behind, before]) {
      expect([...writes.values()].every(isOrderKey)).toBe(true);
    }
  });

  test("in an unarranged view, only what the moves pass gets a key", () => {
    const top = planMoves(["a", "b", "c"], new Map(), ["c", "a"], "top");
    expect([...top.keys()]).toEqual(["c", "a"]);
    expect(after(["a", "b", "c"], new Map(), top)).toEqual(["c", "a", "b"]);

    const bottom = planMoves(["a", "b", "c"], new Map(), ["a"], "bottom");
    expect([...bottom.keys()]).toEqual(["b", "c", "a"]);
    expect(after(["a", "b", "c"], new Map(), bottom)).toEqual(["b", "c", "a"]);
  });

  test("no items, no keys", () => {
    expect(planMoves(sequence, arranged, [], "top").size).toBe(0);
  });
});
