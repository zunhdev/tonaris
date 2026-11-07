// Folder and list colors against an in-memory store (TON-175, TS-21): set and cleared, compare-and-set, only the
// palette's, and not in Trash.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { ContainerColor, StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
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
  color: null,
  ownerId: owner,
  trashed: false,
  ...values,
});

function setup(...containers: StoredContainer[]) {
  const context = memoryStore({ containers });
  const run = (mutation: unknown): Promise<CommandResult> =>
    runCommand(mutationSchema.parse(mutation), { principal: anna, store: context.store });
  return { run, containers: context.containers };
}

const colorIt = (
  id: string,
  color: ContainerColor | null,
  base: ContainerColor | null,
): Mutation => ({
  mutationId: uuidv7(),
  name: "container.setColor",
  args: { id, color },
  base: { color: base },
});

describe("folder and list colors (TON-175)", () => {
  test("a color is set, and null clears it", async () => {
    const rock = container("folder", "Rock");
    const { run, containers } = setup(rock);
    const set = await run(colorIt(rock.id, "orange", null));
    expect(set).toMatchObject({
      status: "applied",
      changes: [{ entity: "container", id: rock.id, op: "update", data: { color: "orange" } }],
    });
    expect(containers.get(rock.id)?.color).toBe("orange");
    await run(colorIt(rock.id, null, "orange"));
    expect(containers.get(rock.id)?.color).toBeNull();
  });

  test("a color changed elsewhere is a conflict, and the same one changes nothing", async () => {
    const doom = container("list", "Doom", { color: "red" });
    const { run } = setup(doom);
    expect(await run(colorIt(doom.id, "blue", null))).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "color", current: "red", attempted: "blue", base: null }],
    });
    expect(await run(colorIt(doom.id, "red", "red"))).toEqual({ status: "applied", changes: [] });
  });

  test("only the palette's colors, and not in Trash", async () => {
    const gone = container("list", "Gone", { trashed: true });
    const { run } = setup(gone);
    expect(() =>
      mutationSchema.parse({
        ...colorIt(gone.id, null, null),
        args: { id: gone.id, color: "beige" },
      }),
    ).toThrow();
    expect(await run(colorIt(gone.id, "teal", null))).toMatchObject({ status: "failed" });
  });
});
