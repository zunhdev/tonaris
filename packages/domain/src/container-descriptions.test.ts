// Folder and list descriptions against an in-memory store (FR-03.5, TS-21; AC-03's description checks): set, trimmed
// and cleared; at most 2,000 characters, as clients check too; compare-and-set; kept through a move; and not editable
// in Trash.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import { descriptionProblem, type StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import { exceedsLength } from "./names";
import type { Principal } from "./principals";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };

const container = (
  kind: StoredContainer["kind"],
  name: string,
  values: Partial<StoredContainer> = {},
): StoredContainer => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
  ownerId: owner,
  trashed: false,
  ...values,
});

function setup(...containers: StoredContainer[]) {
  const context = memoryStore({ containers });
  const run = (mutation: Mutation): Promise<CommandResult> =>
    runCommand(mutationSchema.parse(mutation), { principal: anna, store: context.store });
  return { run, containers: context.containers };
}

const describeIt = (id: string, text: string | null, base: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "container.describe",
  args: { id, description: text },
  base: { description: base },
});

describe("folder and list descriptions (FR-03.5; AC-03)", () => {
  test("a description is set trimmed, and empty text or null clears it", async () => {
    const grunge = container("list", "Grunge");
    const { run, containers } = setup(grunge);
    expect(await run(describeIt(grunge.id, "  Seattle, 1988–1994\\nLoud.  ", null))).toEqual({
      status: "applied",
      changes: [
        {
          entity: "container",
          id: grunge.id,
          op: "update",
          data: {
            id: grunge.id,
            kind: "list",
            parentId: null,
            name: "Grunge",
            description: "Seattle, 1988–1994\\nLoud.",
          },
        },
      ],
    });
    await run(describeIt(grunge.id, "  ", "Seattle, 1988–1994\\nLoud."));
    expect(containers.get(grunge.id)?.description).toBeNull();
    await run(describeIt(grunge.id, "Again", null));
    await run(describeIt(grunge.id, null, "Again"));
    expect(containers.get(grunge.id)?.description).toBeNull();
  });

  test("a description is at most 2,000 characters", async () => {
    const grunge = container("list", "Grunge");
    const { run, containers } = setup(grunge);
    expect(await run(describeIt(grunge.id, "x".repeat(2_000), null))).toMatchObject({
      status: "applied",
    });
    expect(await run(describeIt(grunge.id, "y".repeat(2_001), "x".repeat(2_000)))).toMatchObject({
      status: "failed",
      code: "validation_failed",
      problem: { detail: "Descriptions can be at most 2,000 characters." },
    });
    expect(containers.get(grunge.id)?.description).toBe("x".repeat(2_000));
  });

  test("clients check a description with the server's rule and words, in code points", () => {
    // An emoji with a skin tone is one grapheme and two code points.
    const wave = "👋🏽";
    expect(descriptionProblem("")).toBeUndefined();
    expect(descriptionProblem(wave.repeat(1_000))).toBeUndefined();
    expect(descriptionProblem(`${wave.repeat(1_000)}.`)).toMatchObject({
      code: "validation_failed",
      problem: {
        detail: "Descriptions can be at most 2,000 characters.",
        errors: [{ path: "args.description", message: "At most 2000 characters" }],
      },
    });
    expect(exceedsLength(wave, 1)).toBe(true);
    expect(exceedsLength(wave, 2)).toBe(false);
  });

  test("a description changed elsewhere is a conflict, and the same one changes nothing", async () => {
    const grunge = container("folder", "Grunge", { description: "Seattle" });
    const { run } = setup(grunge);
    expect(await run(describeIt(grunge.id, "Aberdeen", null))).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "description", current: "Seattle", attempted: "Aberdeen", base: null }],
    });
    expect(await run(describeIt(grunge.id, "Seattle", "Seattle"))).toEqual({
      status: "applied",
      changes: [],
    });
  });

  test("a description stays through a move, and can't change in Trash", async () => {
    const rock = container("folder", "Rock");
    const grunge = container("list", "Grunge", { description: "Seattle" });
    const old = container("list", "Old", { description: "Kept", trashed: true });
    const { run, containers } = setup(rock, grunge, old);
    expect(
      await run({
        mutationId: uuidv7(),
        name: "container.move",
        args: { id: grunge.id, parentId: rock.id },
        base: { parentId: null },
      }),
    ).toMatchObject({ status: "applied", changes: [{ data: { description: "Seattle" } }] });
    expect(containers.get(grunge.id)).toMatchObject({ parentId: rock.id, description: "Seattle" });
    expect(await run(describeIt(old.id, "New", "Kept"))).toMatchObject({
      status: "failed",
      code: "trashed",
    });
    expect(containers.get(old.id)?.description).toBe("Kept");
  });
});
