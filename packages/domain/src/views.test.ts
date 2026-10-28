// The preference commands against an in-memory store (FR-05.2, FR-11.7, FR-09.4): remembered view choices and
// account defaults, with field-level compare-and-set like content (TS-21). The database layer runs the same commands
// inside the owner's write lock (TS-20).

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { bootstrapSchema, changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore, viewRowKey } from "./testing";
import { appViewDefaults, type ViewDefaults, type ViewPrefs, type ViewPrefsFields } from "./views";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };
const readOnlyAgent: Principal = {
  kind: "mcp",
  userId: owner,
  grantId: uuidv7(),
  mode: "read_only",
};

const container = (kind: StoredContainer["kind"], name: string): StoredContainer => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
  ownerId: owner,
  trashed: false,
});

const setView = (
  viewKey: string,
  args: Partial<ViewPrefsFields>,
  base: Partial<ViewPrefsFields>,
): Mutation =>
  mutationSchema.parse({
    mutationId: uuidv7(),
    name: "view.set",
    args: { viewKey, ...args },
    base,
  });

const setDefaults = (args: Partial<ViewDefaults>, base: Partial<ViewDefaults>): Mutation =>
  mutationSchema.parse({ mutationId: uuidv7(), name: "defaults.set", args, base });

/** The changes, checked against the stream's schema as the database layer will log them. */
function changesOf(result: CommandResult) {
  expect(result.status).toBe("applied");
  if (result.status !== "applied") return [];
  for (const change of result.changes) {
    changeSchema.parse({ ...change, seq: 1, mutationId: null });
  }
  return result.changes;
}

function failed(result: CommandResult) {
  expect(result.status).toBe("failed");
  return result.status === "failed" ? result : undefined;
}

describe("view.set", () => {
  test("remembers a list's sort, then its grouping, each from its prior value", async () => {
    const doom = container("list", "Doom");
    const memory = memoryStore({ containers: [doom] });
    const sorted = await runCommand(
      setView(doom.id, { sortMode: "name", sortDir: "desc" }, { sortMode: null, sortDir: null }),
      { principal: anna, store: memory.store },
    );
    const prefs: ViewPrefs = {
      viewKey: doom.id,
      sortMode: "name",
      sortDir: "desc",
      grouped: null,
      layout: null,
    };
    expect(changesOf(sorted)).toEqual([{ entity: "view", id: doom.id, op: "insert", data: prefs }]);

    const grouped = await runCommand(setView(doom.id, { grouped: true }, { grouped: null }), {
      principal: anna,
      store: memory.store,
    });
    expect(changesOf(grouped)).toEqual([
      { entity: "view", id: doom.id, op: "update", data: { ...prefs, grouped: true } },
    ]);
    expect(memory.views.get(viewRowKey(owner, doom.id))).toEqual({ ...prefs, grouped: true });
  });

  test("forgets the view when every choice is cleared back to the defaults", async () => {
    const memory = memoryStore({
      views: [
        {
          personId: owner,
          viewKey: "unsorted",
          sortMode: "name",
          sortDir: "asc",
          grouped: null,
          layout: "grid",
        },
      ],
    });
    const result = await runCommand(
      setView(
        "unsorted",
        { sortMode: null, sortDir: null, layout: null },
        { sortMode: "name", sortDir: "asc", layout: "grid" },
      ),
      { principal: anna, store: memory.store },
    );
    expect(changesOf(result)).toEqual([
      { entity: "view", id: "unsorted", op: "delete", data: null },
    ]);
    expect(memory.views.size).toBe(0);
  });

  test("changes nothing when the choice is already saved", async () => {
    const memory = memoryStore({
      views: [
        {
          personId: owner,
          viewKey: "root",
          sortMode: "name",
          sortDir: "asc",
          grouped: null,
          layout: null,
        },
      ],
    });
    const result = await runCommand(
      setView("root", { sortMode: "name", sortDir: "asc" }, { sortMode: "name", sortDir: "asc" }),
      { principal: anna, store: memory.store },
    );
    expect(changesOf(result)).toEqual([]);
  });

  test("a stale choice is a conflict naming the current, attempted and prior values (FR-09.4)", async () => {
    const doom = container("list", "Doom");
    const memory = memoryStore({
      containers: [doom],
      views: [
        {
          personId: owner,
          viewKey: doom.id,
          sortMode: "name",
          sortDir: "asc",
          grouped: null,
          layout: null,
        },
      ],
    });
    const result = await runCommand(
      setView(doom.id, { sortMode: "year", sortDir: "asc" }, { sortMode: null, sortDir: null }),
      { principal: anna, store: memory.store },
    );
    expect(result).toEqual({
      status: "conflict",
      conflicts: [
        { field: "sortMode", current: "name", attempted: "year", base: null },
        { field: "sortDir", current: "asc", attempted: "asc", base: null },
      ],
    });
    expect(memory.views.get(viewRowKey(owner, doom.id))?.sortMode).toBe("name");
  });

  test("the sort's mode and direction change together", async () => {
    const { store } = memoryStore();
    const alone = failed(
      await runCommand(setView("unsorted", { sortMode: "name" }, { sortMode: null }), {
        principal: anna,
        store,
      }),
    );
    expect(alone?.problem.errors).toEqual([{ path: "args.sortDir", message: "Required" }]);
    const half = failed(
      await runCommand(
        setView("unsorted", { sortMode: "name", sortDir: null }, { sortMode: null, sortDir: null }),
        { principal: anna, store },
      ),
    );
    expect(half?.code).toBe("validation_failed");
  });

  test("a folder takes folder sorts, and no grouping or layout", async () => {
    const metal = container("folder", "Metal");
    const { store } = memoryStore({ containers: [metal] });
    const byYear = failed(
      await runCommand(
        setView(metal.id, { sortMode: "year", sortDir: "asc" }, { sortMode: null, sortDir: null }),
        { principal: anna, store },
      ),
    );
    expect(byYear?.problem.detail).toBe(
      "Folders and the collection sort by name, creation date or manual order.",
    );
    const grouped = failed(
      await runCommand(setView("root", { grouped: true }, { grouped: null }), {
        principal: anna,
        store,
      }),
    );
    expect(grouped?.problem.errors).toEqual([{ path: "args.grouped", message: "Must be null" }]);
    const created = await runCommand(
      setView(
        metal.id,
        { sortMode: "created", sortDir: "desc" },
        { sortMode: null, sortDir: null },
      ),
      { principal: anna, store },
    );
    expect(changesOf(created)).toHaveLength(1);
  });

  test("a list takes list sorts", async () => {
    const doom = container("list", "Doom");
    const { store } = memoryStore({ containers: [doom] });
    const result = failed(
      await runCommand(
        setView(
          doom.id,
          { sortMode: "created", sortDir: "asc" },
          { sortMode: null, sortDir: null },
        ),
        { principal: anna, store },
      ),
    );
    expect(result?.problem.detail).toBe("Lists and Unsorted sort by year, name or manual order.");
  });

  test("base must name exactly the changed fields", async () => {
    const { store } = memoryStore();
    const result = failed(
      await runCommand(setView("unsorted", { layout: "grid" }, { grouped: null }), {
        principal: anna,
        store,
      }),
    );
    expect(result?.problem.errors?.map((error) => error.path)).toEqual([
      "base.layout",
      "base.grouped",
    ]);
  });

  test("another person's list and a missing one get the same answer", async () => {
    const doom = container("list", "Doom");
    const { store } = memoryStore({ containers: [doom] });
    const theirs = failed(
      await runCommand(setView(doom.id, { layout: "grid" }, { layout: null }), {
        principal: ben,
        store,
      }),
    );
    const missing = failed(
      await runCommand(setView(uuidv7(), { layout: "grid" }, { layout: null }), {
        principal: anna,
        store,
      }),
    );
    expect(theirs?.code).toBe("not_found");
    expect(missing?.problem).toEqual(theirs!.problem);
  });

  test("a list in Trash still takes its owner's choices", async () => {
    const doom = { ...container("list", "Doom"), trashed: true };
    const { store } = memoryStore({ containers: [doom] });
    const result = await runCommand(setView(doom.id, { layout: "grid" }, { layout: null }), {
      principal: anna,
      store,
    });
    expect(changesOf(result)).toHaveLength(1);
  });

  test("a read-only agent changes nothing", async () => {
    const memory = memoryStore();
    const result = failed(
      await runCommand(setView("unsorted", { layout: "grid" }, { layout: null }), {
        principal: readOnlyAgent,
        store: memory.store,
      }),
    );
    expect(result?.code).toBe("permission_denied");
    expect(memory.views.size).toBe(0);
  });
});

describe("defaults.set", () => {
  test("merges into DS-44's defaults and logs the complete defaults", async () => {
    const memory = memoryStore();
    const result = await runCommand(
      setDefaults({ listSortMode: "name" }, { listSortMode: "year" }),
      {
        principal: anna,
        store: memory.store,
      },
    );
    const next: ViewDefaults = { ...appViewDefaults, listSortMode: "name" };
    expect(changesOf(result)).toEqual([
      { entity: "defaults", id: owner, op: "update", data: next },
    ]);
    expect(memory.defaults.get(owner)).toEqual(next);
  });

  test("a stale default is a conflict, and nothing changes", async () => {
    const memory = memoryStore({
      defaults: [{ personId: owner, ...appViewDefaults, grouped: true }],
    });
    const result = await runCommand(
      setDefaults({ grouped: false, layout: "grid" }, { grouped: false, layout: "rows" }),
      {
        principal: anna,
        store: memory.store,
      },
    );
    expect(result).toEqual({
      status: "conflict",
      conflicts: [{ field: "grouped", current: true, attempted: false, base: false }],
    });
    expect(memory.defaults.get(owner)?.layout).toBe("rows");
  });

  test("the same defaults change nothing", async () => {
    const { store } = memoryStore();
    const result = await runCommand(setDefaults({ layout: "rows" }, { layout: "rows" }), {
      principal: anna,
      store,
    });
    expect(changesOf(result)).toEqual([]);
  });

  test("names at least one default", async () => {
    const { store } = memoryStore();
    expect(failed(await runCommand(setDefaults({}, {}), { principal: anna, store }))?.code).toBe(
      "validation_failed",
    );
  });
});

const envelope = (viewKey: string) => ({
  mutationId: uuidv7(),
  name: "view.set",
  args: { viewKey, layout: "grid" },
  base: { layout: null },
});

describe("the protocol", () => {
  test("the bootstrap carries the remembered views and the complete defaults", () => {
    const snapshot = {
      seq: 0,
      albums: [],
      containers: [],
      memberships: [],
      links: [],
      fields: [],
      fieldValues: [],
      positions: [],
      trashUnits: [],
    };
    expect(bootstrapSchema.safeParse(snapshot).success).toBe(false);
    const views: ViewPrefs[] = [
      { viewKey: "root", sortMode: "name", sortDir: "asc", grouped: null, layout: null },
    ];
    expect(bootstrapSchema.parse({ ...snapshot, views, defaults: appViewDefaults })).toEqual({
      ...snapshot,
      views,
      defaults: appViewDefaults,
    });
  });

  test("a view key is the root, Unsorted, or a folder's or list's ID", () => {
    expect(mutationSchema.safeParse(envelope("unsorted")).success).toBe(true);
    expect(mutationSchema.safeParse(envelope(uuidv7())).success).toBe(true);
    expect(mutationSchema.safeParse(envelope("trash")).success).toBe(false);
  });
});
