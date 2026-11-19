// Folder and list icons against an in-memory store (TON-306, TS-21): set and cleared, compare-and-set, only the set's,
// not in Trash, and not passed to what's inside.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { ContainerIconName, StoredContainer } from "./containers";
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
  icon: null,
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

const iconIt = (
  id: string,
  icon: ContainerIconName | null,
  base: ContainerIconName | null,
): Mutation => ({
  mutationId: uuidv7(),
  name: "container.setIcon",
  args: { id, icon },
  base: { icon: base },
});

describe("folder and list icons (TON-306)", () => {
  test("an icon is set, and null clears it", async () => {
    const rock = container("folder", "Rock");
    const { run, containers } = setup(rock);
    const set = await run(iconIt(rock.id, "guitar", null));
    expect(set).toMatchObject({
      status: "applied",
      changes: [{ entity: "container", id: rock.id, op: "update", data: { icon: "guitar" } }],
    });
    expect(containers.get(rock.id)?.icon).toBe("guitar");
    await run(iconIt(rock.id, null, "guitar"));
    expect(containers.get(rock.id)?.icon).toBeNull();
  });

  test("an icon changed elsewhere is a conflict, and the same one changes nothing", async () => {
    const doom = container("list", "Doom", { icon: "skull" });
    const { run } = setup(doom);
    expect(await run(iconIt(doom.id, "horns", null))).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "icon", current: "skull", attempted: "horns", base: null }],
    });
    expect(await run(iconIt(doom.id, "skull", "skull"))).toEqual({
      status: "applied",
      changes: [],
    });
  });

  test("only the set's icons, and not in Trash", async () => {
    const gone = container("list", "Gone", { trashed: true });
    const { run } = setup(gone);
    expect(() =>
      mutationSchema.parse({ ...iconIt(gone.id, null, null), args: { id: gone.id, icon: "rock" } }),
    ).toThrow();
    expect(await run(iconIt(gone.id, "drum", null))).toMatchObject({ status: "failed" });
  });

  test("a folder's icon stays its own: its list and its color are untouched", async () => {
    const metal = container("folder", "Metal", { color: "orange" });
    const doom = container("list", "Doom", { parentId: metal.id });
    const { run, containers } = setup(metal, doom);
    await run(iconIt(metal.id, "horns", null));
    expect(containers.get(metal.id)).toMatchObject({ icon: "horns", color: "orange" });
    expect(containers.get(doom.id)?.icon).toBeNull();
  });

  test("a new folder or list has no icon", async () => {
    const { run, containers } = setup();
    const id = uuidv7();
    await run({
      mutationId: uuidv7(),
      name: "container.create",
      args: { id, kind: "folder", parentId: null, name: "Jazz" },
    });
    expect(containers.get(id)?.icon).toBeNull();
  });
});
