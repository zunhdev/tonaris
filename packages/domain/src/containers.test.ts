// The folder and list commands against an in-memory store (FR-01.1–FR-01.5, X-05, X-06, TS-18): one test per spec
// scenario, then a property test that random sequences of creates, renames and moves always leave a sound tree.
// The database layer runs the same commands inside the owner's write lock (TS-20).

import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import { runCommand, type CommandResult } from "./commands";
import {
  containerNameProblem,
  nameTakenProblem,
  type Container,
  type ContainerFields,
  type StoredContainer,
} from "./containers";
import { uuidv7 } from "./ids";
import { maxContainerDepth, maxContainers } from "./limits";
import { nameKey } from "./normalize";
import type { Principal } from "./principals";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const other: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };
const readOnlyAgent: Principal = {
  kind: "mcp",
  userId: owner,
  grantId: uuidv7(),
  mode: "read_only",
};

function stored(
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
  values: Partial<StoredContainer> = {},
): StoredContainer {
  return {
    id: uuidv7(),
    kind,
    parentId,
    name,
    description: null,
    ownerId: owner,
    trashed: false,
    ...values,
  };
}
const folder = (name: string, parentId: string | null = null, values = {}) =>
  stored("folder", name, parentId, values);
const list = (name: string, parentId: string | null = null, values = {}) =>
  stored("list", name, parentId, values);

/** `count` folders, each inside the one before: the last is `count` levels deep. */
function nested(count: number): StoredContainer[] {
  const chain: StoredContainer[] = [];
  for (let level = 1; level <= count; level += 1) {
    chain.push(folder(`Level ${level}`, chain.at(-1)?.id ?? null));
  }
  return chain;
}

type Create = Extract<Mutation, { name: "container.create" }>;

const create = (args: Omit<ContainerFields, "id"> & { id?: string }): Create => ({
  mutationId: uuidv7(),
  name: "container.create",
  args: { id: uuidv7(), ...args },
});
const rename = (id: string, name: string, base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "container.rename",
  args: { id, name },
  base: { name: base },
});
const move = (id: string, parentId: string | null, base: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "container.move",
  args: { id, parentId },
  base: { parentId: base },
});

function setup(...containers: StoredContainer[]) {
  const memory = memoryStore({ containers });
  const run = (mutation: Mutation, principal: Principal = anna) =>
    runCommand(mutation, { principal, store: memory.store });
  return { ...memory, run };
}

/** The outcome's error code, or its status when it isn't a rejection. */
function codeOf(result: CommandResult): string {
  return result.status === "failed" ? result.code : result.status;
}

describe("the envelopes", () => {
  test("parse with the client's v7 ID, and refuse other kinds and IDs", () => {
    expect(
      mutationSchema.safeParse(create({ kind: "list", parentId: null, name: "A" })).success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({
        ...create({ kind: "list", parentId: null, name: "A" }),
        args: { id: uuidv7(), kind: "playlist", parentId: null, name: "A" },
      }).success,
    ).toBe(false);
    expect(
      mutationSchema.safeParse(
        create({ id: crypto.randomUUID(), kind: "folder", parentId: null, name: "A" }),
      ).success,
    ).toBe(false);
    expect(mutationSchema.safeParse(move(uuidv7(), null, uuidv7())).success).toBe(true);
    expect(mutationSchema.safeParse(rename(uuidv7(), "B", "A")).success).toBe(true);
  });
});

describe("container.create (FR-01.1, FR-01.2)", () => {
  test("creates at the root and inside folders, and logs each insert", async () => {
    const { run, containers } = setup();
    const jazz = create({ kind: "folder", parentId: null, name: "Jazz" });
    expect(await run(jazz)).toEqual({
      status: "applied",
      changes: [
        {
          entity: "container",
          id: jazz.args.id,
          op: "insert",
          data: { ...jazz.args, description: null },
        },
      ],
    });
    const bebop = create({ kind: "folder", parentId: jazz.args.id, name: "Bebop" });
    const favorites = create({ kind: "list", parentId: bebop.args.id, name: "Favorites" });
    expect(codeOf(await run(bebop))).toBe("applied");
    expect(codeOf(await run(favorites))).toBe("applied");
    expect(containers.get(favorites.args.id)).toEqual({
      ...favorites.args,
      description: null,
      ownerId: owner,
      trashed: false,
    });
  });

  test("lists hold no containers", async () => {
    const later = list("Later");
    const { run, containers } = setup(later);
    const results = await Promise.all(
      (["folder", "list"] as const).map((kind) =>
        run(create({ kind, parentId: later.id, name: "Inside" })),
      ),
    );
    expect(results.map(codeOf)).toEqual(["invalid_destination", "invalid_destination"]);
    expect(containers.size).toBe(1);
  });

  test("nesting stops at 32 levels", async () => {
    const chain = nested(maxContainerDepth);
    const { run } = setup(...chain);
    const deepest = chain.at(-1)!;
    expect(codeOf(await run(create({ kind: "list", parentId: deepest.id, name: "Deep" })))).toBe(
      "limit_exceeded",
    );
    // One level up there is room for the 32nd level.
    const parent = chain.at(-2)!;
    expect(codeOf(await run(create({ kind: "list", parentId: parent.id, name: "Deep" })))).toBe(
      "applied",
    );
  });

  test("a retried create duplicates nothing; different values are a conflict", async () => {
    const { run, containers } = setup();
    const jazz = create({ kind: "folder", parentId: null, name: "Jazz" });
    await run(jazz);
    expect(await run({ ...jazz, mutationId: uuidv7() })).toEqual({
      status: "applied",
      changes: [],
    });
    expect(
      await run({ ...jazz, mutationId: uuidv7(), args: { ...jazz.args, name: "Rock" } }),
    ).toEqual({
      status: "conflict",
      conflicts: [{ field: "name", current: "Jazz", attempted: "Rock" }],
    });
    expect(containers.size).toBe(1);
  });

  test("another owner's ID is refused", async () => {
    const theirs = { ...folder("Theirs"), ownerId: uuidv7() };
    const { run } = setup(theirs);
    const result = await run(
      create({ id: theirs.id, kind: "folder", parentId: null, name: "Mine" }),
    );
    expect(codeOf(result)).toBe("validation_failed");
  });

  test("a list and a folder can't share a name under one parent, whatever the case", async () => {
    const { run, containers } = setup(folder("Jazz"));
    const result = await run(create({ kind: "list", parentId: null, name: "jazz" }));
    expect(codeOf(result)).toBe("name_conflict");
    expect(result.status === "failed" && result.problem.detail).toBe(
      "'Jazz' already exists at the top level. Choose another name.",
    );
    expect(containers.size).toBe(1);
  });

  test("the refusals clients check with before sending read as the commands' (DS-107)", () => {
    expect(containerNameProblem("  ")?.problem.detail).toBe("Give the folder or list a name.");
    expect(containerNameProblem("x".repeat(201))?.problem.detail).toBe(
      "Names can be at most 200 characters.",
    );
    expect(containerNameProblem("Doom")).toBeUndefined();
    expect(nameTakenProblem("Favorites", "Metal").problem.detail).toBe(
      "'Favorites' already exists in Metal. Choose another name.",
    );
    expect(nameTakenProblem("Later", null).problem.detail).toBe(
      "'Later' already exists at the top level. Choose another name.",
    );
  });

  test("a name taken in a folder names the folder (DS-107)", async () => {
    const metal = folder("Metal");
    const { run } = setup(metal, list("Favorites", metal.id));
    const result = await run(create({ kind: "list", parentId: metal.id, name: "Favorites" }));
    expect(result.status === "failed" && result.problem.detail).toBe(
      "'Favorites' already exists in Metal. Choose another name.",
    );
  });

  test("the same name under different parents", async () => {
    const jazz = folder("Jazz");
    const rock = folder("Rock");
    const { run } = setup(jazz, rock);
    expect(codeOf(await run(create({ kind: "list", parentId: jazz.id, name: "Favorites" })))).toBe(
      "applied",
    );
    expect(codeOf(await run(create({ kind: "list", parentId: rock.id, name: "Favorites" })))).toBe(
      "applied",
    );
  });

  test("a container in Trash reserves no name", async () => {
    const { run } = setup(folder("Jazz", null, { trashed: true }));
    expect(codeOf(await run(create({ kind: "folder", parentId: null, name: "Jazz" })))).toBe(
      "applied",
    );
  });

  test("blank or overlong names are invalid", async () => {
    const { run, containers } = setup();
    const results = await Promise.all(
      ["", "   ", "　\t", "x".repeat(201)].map((name) =>
        run(create({ kind: "list", parentId: null, name })),
      ),
    );
    expect(results.map(codeOf)).toEqual(Array.from({ length: 4 }, () => "validation_failed"));
    // The limit counts characters, not UTF-16 units: 200 emoji fit.
    expect(
      codeOf(await run(create({ kind: "list", parentId: null, name: "🎷".repeat(200) }))),
    ).toBe("applied");
    expect(containers.size).toBe(1);
  });

  test("names keep their spelling, without surrounding whitespace", async () => {
    const { run, containers } = setup();
    const mutation = create({ kind: "list", parentId: null, name: "  Late Night Jazz " });
    const result = await run(mutation);
    expect(result.status === "applied" && result.changes[0]?.data).toMatchObject({
      name: "Late Night Jazz",
    });
    expect(containers.get(mutation.args.id)?.name).toBe("Late Night Jazz");
  });

  test("missing, someone else's and trashed parents are invalid destinations", async () => {
    const theirs = { ...folder("Theirs"), ownerId: uuidv7() };
    const gone = folder("Gone", null, { trashed: true });
    const { run } = setup(theirs, gone);
    const results = await Promise.all(
      [uuidv7(), theirs.id, gone.id].map((parentId) =>
        run(create({ kind: "list", parentId, name: "A" })),
      ),
    );
    expect(results.map(codeOf)).toEqual(Array.from({ length: 3 }, () => "invalid_destination"));
  });

  test("creating past 2,000 folders and lists, Trash included, is refused", async () => {
    const existing = Array.from({ length: maxContainers }, (_, index) =>
      list(`List ${index}`, null, { trashed: index % 10 === 0 }),
    );
    const { run, containers } = setup(...existing);
    const result = await run(create({ kind: "list", parentId: null, name: "One more" }));
    expect(codeOf(result)).toBe("limit_exceeded");
    expect(containers.size).toBe(maxContainers);
    // Existing ones stay usable.
    const first = existing[1]!;
    expect(codeOf(await run(rename(first.id, "Renamed", first.name)))).toBe("applied");
  });

  test("only the owner adds, and never through a read-only connection", async () => {
    const { run } = setup();
    const result = await run(create({ kind: "list", parentId: null, name: "A" }), readOnlyAgent);
    expect(codeOf(result)).toBe("permission_denied");
  });
});

describe("container.rename (FR-01.3)", () => {
  test("renames a list, which keeps its identity", async () => {
    const favorites = list("Favorites");
    const { run, containers } = setup(favorites);
    expect(await run(rename(favorites.id, "Desert island", "Favorites"))).toEqual({
      status: "applied",
      changes: [
        {
          entity: "container",
          id: favorites.id,
          op: "update",
          data: {
            id: favorites.id,
            kind: "list",
            parentId: null,
            name: "Desert island",
            description: null,
          },
        },
      ],
    });
    expect(containers.get(favorites.id)?.name).toBe("Desert island");
  });

  test("a case-only rename is allowed", async () => {
    const jazz = folder("jazz");
    const { run, containers } = setup(jazz);
    expect(codeOf(await run(rename(jazz.id, "Jazz", "jazz")))).toBe("applied");
    expect(containers.get(jazz.id)?.name).toBe("Jazz");
  });

  test("a rename into a sibling's name is rejected, and both keep their names", async () => {
    const jazz = folder("Jazz");
    const favorites = list("Favorites", jazz.id);
    const later = list("Later", jazz.id);
    const { run, containers } = setup(jazz, favorites, later);
    expect(codeOf(await run(rename(later.id, "FAVORITES", "Later")))).toBe("name_conflict");
    expect(containers.get(later.id)?.name).toBe("Later");
    expect(containers.get(favorites.id)?.name).toBe("Favorites");
  });

  test("a stale rename is a conflict reporting the current name", async () => {
    const favorites = list("Desert island");
    const { run, containers } = setup(favorites);
    expect(await run(rename(favorites.id, "Top 10", "Favorites"))).toEqual({
      status: "conflict",
      conflicts: [
        { field: "name", current: "Desert island", attempted: "Top 10", base: "Favorites" },
      ],
    });
    expect(containers.get(favorites.id)?.name).toBe("Desert island");
  });

  test("the same name again changes nothing", async () => {
    const jazz = folder("Jazz");
    const { run } = setup(jazz);
    expect(await run(rename(jazz.id, " Jazz ", "Jazz"))).toEqual({
      status: "applied",
      changes: [],
    });
  });

  test("blank names are invalid", async () => {
    const jazz = folder("Jazz");
    const { run } = setup(jazz);
    expect(codeOf(await run(rename(jazz.id, " ", "Jazz")))).toBe("validation_failed");
  });
});

describe("container.move (FR-01.4, FR-01.5)", () => {
  test("a folder moves with everything under it, and nothing is copied", async () => {
    const jazz = folder("Jazz");
    const bebop = folder("Bebop", jazz.id);
    const hardBop = folder("Hard bop", bebop.id);
    const favorites = list("Favorites", bebop.id);
    const later = list("Later", hardBop.id);
    const { run, containers } = setup(jazz, bebop, hardBop, favorites, later);

    const result = await run(move(bebop.id, null, jazz.id));
    expect(result).toEqual({
      status: "applied",
      changes: [
        {
          entity: "container",
          id: bebop.id,
          op: "update",
          data: { id: bebop.id, kind: "folder", parentId: null, name: "Bebop", description: null },
        },
      ],
    });
    expect(containers.size).toBe(5);
    expect(containers.get(hardBop.id)?.parentId).toBe(bebop.id);
    expect(containers.get(favorites.id)?.parentId).toBe(bebop.id);
    expect(containers.get(later.id)?.parentId).toBe(hardBop.id);
  });

  test("a folder can't move into itself or its own subtree", async () => {
    const jazz = folder("Jazz");
    const bebop = folder("Bebop", jazz.id);
    const { run, containers } = setup(jazz, bebop);
    expect(codeOf(await run(move(jazz.id, bebop.id, null)))).toBe("cycle");
    expect(codeOf(await run(move(jazz.id, jazz.id, null)))).toBe("cycle");
    expect(containers.get(jazz.id)?.parentId).toBeNull();
  });

  test("lists, missing, someone else's and trashed folders are invalid destinations", async () => {
    const jazz = folder("Jazz");
    const later = list("Later");
    const theirs = { ...folder("Theirs"), ownerId: uuidv7() };
    const gone = folder("Gone", null, { trashed: true });
    const { run, containers } = setup(jazz, later, theirs, gone);
    const results = await Promise.all(
      [later.id, uuidv7(), theirs.id, gone.id].map((parentId) =>
        run(move(jazz.id, parentId, null)),
      ),
    );
    expect(results.map(codeOf)).toEqual(Array.from({ length: 4 }, () => "invalid_destination"));
    expect(containers.get(jazz.id)?.parentId).toBeNull();
  });

  test("a move can't nest anything deeper than 32 levels", async () => {
    // A folder holding 3 levels (itself, a folder, a list), and destinations 30 and 29 levels deep.
    const chain = nested(30);
    const moved = folder("Moved");
    const inner = folder("Inner", moved.id);
    const leaf = list("Leaf", inner.id);
    const { run, containers } = setup(...chain, moved, inner, leaf);

    expect(codeOf(await run(move(moved.id, chain[29]!.id, null)))).toBe("limit_exceeded");
    expect(containers.get(moved.id)?.parentId).toBeNull();
    expect(codeOf(await run(move(moved.id, chain[28]!.id, null)))).toBe("applied");
  });

  test("a list moves to another folder and keeps its identity", async () => {
    const jazz = folder("Jazz");
    const rock = folder("Rock");
    const favorites = list("Favorites", jazz.id);
    const { run, containers } = setup(jazz, rock, favorites);
    expect(codeOf(await run(move(favorites.id, rock.id, jazz.id)))).toBe("applied");
    expect(containers.get(favorites.id)).toMatchObject({ id: favorites.id, parentId: rock.id });
  });

  test("a move into a sibling's name is rejected", async () => {
    const jazz = folder("Jazz");
    const rock = folder("Rock");
    const mine = list("Favorites", jazz.id);
    const theirs = list("favorites", rock.id);
    const { run, containers } = setup(jazz, rock, mine, theirs);
    expect(codeOf(await run(move(mine.id, rock.id, jazz.id)))).toBe("name_conflict");
    expect(containers.get(mine.id)?.parentId).toBe(jazz.id);
  });

  test("a stale move is a conflict reporting the current parent", async () => {
    const jazz = folder("Jazz");
    const rock = folder("Rock");
    const favorites = list("Favorites", rock.id);
    const { run, containers } = setup(jazz, rock, favorites);
    expect(await run(move(favorites.id, null, jazz.id))).toEqual({
      status: "conflict",
      conflicts: [{ field: "parentId", current: rock.id, attempted: null, base: jazz.id }],
    });
    expect(containers.get(favorites.id)?.parentId).toBe(rock.id);
  });

  test("moving to the current parent changes nothing", async () => {
    const jazz = folder("Jazz");
    const { run } = setup(jazz);
    expect(await run(move(jazz.id, null, null))).toEqual({ status: "applied", changes: [] });
  });
});

describe("rejections change nothing (X-05)", () => {
  test("containers in Trash can't be renamed or moved", async () => {
    const jazz = folder("Jazz");
    const gone = folder("Gone", null, { trashed: true });
    const { run, containers } = setup(jazz, gone);
    expect(codeOf(await run(rename(gone.id, "Back", "Gone")))).toBe("trashed");
    expect(codeOf(await run(move(gone.id, jazz.id, null)))).toBe("trashed");
    expect(containers.get(gone.id)).toEqual(gone);
  });

  test("only the owner changes their containers", async () => {
    const jazz = folder("Jazz");
    const rock = folder("Rock");
    const { run, containers } = setup(jazz, rock);
    expect(codeOf(await run(rename(jazz.id, "Mine", "Jazz"), other))).toBe("permission_denied");
    expect(codeOf(await run(move(jazz.id, rock.id, null), other))).toBe("permission_denied");
    expect(codeOf(await run(rename(jazz.id, "Mine", "Jazz"), readOnlyAgent))).toBe(
      "permission_denied",
    );
    expect(containers.get(jazz.id)).toEqual(jazz);
  });

  test("a container that doesn't exist is not found", async () => {
    const { run } = setup();
    expect(codeOf(await run(rename(uuidv7(), "A", "B")))).toBe("not_found");
    expect(codeOf(await run(move(uuidv7(), null, null)))).toBe("not_found");
  });
});

/** The tree's rules: parents are folders, no cycles, bounded depth, unique active sibling names. */
function assertSound(rows: Map<string, StoredContainer>) {
  const seen = new Map<string, string>();
  for (const row of rows.values()) {
    let depth = 0;
    for (let at: StoredContainer | undefined = row; at; at = rows.get(at.parentId ?? "")) {
      depth += 1;
      expect(depth).toBeLessThanOrEqual(maxContainerDepth);
      if (at.parentId !== null) expect(rows.get(at.parentId)?.kind).toBe("folder");
    }
    if (!row.trashed) {
      const key = `${row.parentId}:${nameKey(row.name)}`;
      expect(seen.get(key)).toBeUndefined();
      seen.set(key, row.id);
    }
  }
}

describe("any sequence of commands leaves a sound tree (property)", () => {
  type Step =
    | { op: "create"; kind: Container["kind"]; parent: number | null; name: string }
    | { op: "rename"; target: number; name: string }
    | { op: "move"; target: number; parent: number | null };

  // Few names, in several spellings, so collisions are common.
  const names = fc.constantFrom(
    "Jazz",
    "jazz",
    " Jazz ",
    "Rock",
    "Favorites",
    "FAVORITES",
    "Later",
  );
  const index = fc.nat({ max: 40 });
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({
      op: fc.constant("create" as const),
      kind: fc.constantFrom("folder" as const, "list" as const),
      parent: fc.option(index, { nil: null }),
      name: names,
    }),
    fc.record({ op: fc.constant("rename" as const), target: index, name: names }),
    fc.record({
      op: fc.constant("move" as const),
      target: index,
      parent: fc.option(index, { nil: null }),
    }),
  );

  test("holds for random creates, renames and moves", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 60 }), async (steps) => {
        const { run, containers } = setup();
        const ids: string[] = [];
        const pick = (at: number | null) =>
          at === null || ids.length === 0 ? null : ids[at % ids.length]!;

        // Each step depends on the state the one before left.
        for (const each of steps) {
          const before = structuredClone([...containers.entries()]);
          let mutation: Mutation | undefined;
          if (each.op === "create") {
            mutation = create({ kind: each.kind, parentId: pick(each.parent), name: each.name });
          } else {
            const id = pick(each.target);
            const current = id ? containers.get(id) : undefined;
            if (!id || !current) continue;
            mutation =
              each.op === "rename"
                ? rename(id, each.name, current.name)
                : move(id, pick(each.parent), current.parentId);
          }
          // oxlint-disable-next-line no-await-in-loop
          const result = await run(mutation);
          if (result.status === "applied") {
            if (mutation.name === "container.create") ids.push(mutation.args.id);
            // Every logged change is what was saved.
            for (const change of result.changes) {
              const row = containers.get(change.id)!;
              expect(change.data).toEqual({
                id: row.id,
                kind: row.kind,
                parentId: row.parentId,
                name: row.name,
                description: row.description,
              });
            }
          } else {
            expect([...containers.entries()]).toEqual(before);
          }
          assertSound(containers);
        }
      }),
    );
  });
});
