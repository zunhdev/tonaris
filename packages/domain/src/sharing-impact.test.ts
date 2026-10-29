// A move's and a recovery's sharing consequences (FR-07.9, FR-07.10, FR-07.14; DS-69): into, out of and between shared
// folders, with another path kept, pending people, direct shares below, and recovery; and, as a property against the
// access rules, nobody named as losing access keeps it, and nobody gaining it is missed.

import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import { uuidv7 } from "./ids";
import { readableContainers, type SharingState } from "./sharing";
import { listsImpact, moveImpact, recoveryImpact, type ImpactState } from "./sharing-impact";

const [anna, ben] = [uuidv7(), uuidv7()];
const container = (name: string, parentId: string | null = null, trashed = false) => ({
  id: uuidv7(),
  name,
  parentId,
  trashed,
});

const metal = container("Metal");
const heavy = container("Heavy");
const doom = container("Doom", metal.id);
const epic = container("Epic", doom.id);

function state(
  people: { on: { id: string }; who: string; pending?: boolean }[],
  links: { id: string }[] = [],
  containers = [metal, heavy, doom, epic],
): ImpactState {
  return {
    containers,
    people: people.map(({ on, who, pending = false }) => ({
      containerId: on.id,
      personId: who,
      name: who === anna ? "Anna" : "ben@example.com",
      pending,
    })),
    links: links.map((each) => ({ containerId: each.id })),
  };
}

const names = (audiences: { kind: string; name?: string; via: { name: string } }[]) =>
  audiences.map((each) => (each.kind === "person" ? each.name : `link to ${each.via.name}`));

describe("moveImpact (FR-07.9)", () => {
  test("into a shared folder adds its audiences; out of one removes them", () => {
    const shared = state([{ on: heavy, who: anna }], [heavy]);
    const into = moveImpact(shared, doom.id, heavy.id);
    expect(names(into.added)).toEqual(["Anna", "link to Heavy"]);
    expect(into.removed).toEqual([]);
    const out = moveImpact(state([{ on: metal, who: anna }]), doom.id, null);
    expect(out.removed).toEqual([
      {
        kind: "person",
        id: anna,
        name: "Anna",
        pending: false,
        via: { id: metal.id, name: "Metal" },
      },
    ]);
    expect(out.added).toEqual([]);
  });

  test("another path keeps an audience off both lines", () => {
    const both = state([
      { on: metal, who: anna },
      { on: heavy, who: anna },
      { on: heavy, who: ben, pending: true },
    ]);
    const moved = moveImpact(both, doom.id, heavy.id);
    expect(moved.removed).toEqual([]);
    expect(names(moved.added)).toEqual(["ben@example.com"]);
    expect(moved.added[0]).toMatchObject({ pending: true });
    // Shared with Anna directly, Doom keeps her whatever folder it's in.
    const own = moveImpact(
      state([
        { on: metal, who: anna },
        { on: doom, who: anna },
      ]),
      doom.id,
      null,
    );
    expect(own.removed).toEqual([]);
    expect(names(own.direct)).toEqual(["Anna"]);
  });

  test("direct shares on its contents are kept, and listed", () => {
    const below = moveImpact(state([{ on: epic, who: ben }], [epic]), doom.id, heavy.id);
    expect(names(below.direct)).toEqual(["ben@example.com", "link to Epic"]);
    expect(below.added).toEqual([]);
    expect(below.removed).toEqual([]);
  });
});

describe("recovery (FR-07.10, FR-14.2)", () => {
  test("a unit gains its destination's audiences, and its own shares resume", () => {
    const trashedDoom = { ...doom, trashed: true };
    const trashedEpic = { ...epic, trashed: true };
    const recovered = recoveryImpact(
      state(
        [
          { on: heavy, who: anna },
          { on: doom, who: ben },
        ],
        [epic],
        [metal, heavy, trashedDoom, trashedEpic],
      ),
      [doom.id, epic.id],
      heavy.id,
    );
    expect(names(recovered.added)).toEqual(["Anna"]);
    expect(names(recovered.direct)).toEqual(["ben@example.com", "link to Epic"]);
    expect(recovered.removed).toEqual([]);
  });

  test("an album gains the audiences of its lists and their folders", () => {
    const lists = listsImpact(state([{ on: metal, who: anna }], [doom]), [doom.id]);
    expect(names(lists.added)).toEqual(["link to Doom", "Anna"]);
  });
});

describe("as a property, against the access rules", () => {
  /** A forest: each one's parent an earlier container, or the root; folders and lists alike may hold others here. */
  const forest = fc
    .array(fc.option(fc.nat(), { nil: null }), { minLength: 2, maxLength: 10 })
    .map((parents) => {
      const made: ReturnType<typeof container>[] = [];
      for (const [index, parent] of parents.entries()) {
        const parentId =
          parent === null || made.length === 0 ? null : made[parent % made.length]!.id;
        made.push(container(`C${index}`, parentId));
      }
      return made;
    });
  const shares = fc.record({
    people: fc.array(fc.record({ pick: fc.nat(), anna: fc.boolean(), pending: fc.boolean() }), {
      maxLength: 5,
    }),
    links: fc.array(fc.nat(), { maxLength: 3 }),
    item: fc.nat(),
    to: fc.option(fc.nat(), { nil: null }),
  });

  test("anyone named as removed can't read it after; anyone who gains access is named as added", () => {
    fc.assert(
      fc.property(forest, shares, (tree, plan) => {
        const pick = (at: number) => tree[at % tree.length]!;
        const item = pick(plan.item);
        // Not into itself or its contents.
        const below = new Set([item.id]);
        for (const each of tree)
          if (each.parentId !== null && below.has(each.parentId)) below.add(each.id);
        const to = plan.to === null ? null : pick(plan.to).id;
        if (to !== null && below.has(to)) return;

        const people = plan.people.map((each) => ({
          on: pick(each.pick),
          who: each.anna ? anna : ben,
          pending: each.pending,
        }));
        const links = plan.links.map((at) => pick(at));
        const impact = moveImpact(state(people, links, tree), item.id, to);

        const access = (containers: typeof tree): SharingState => ({
          containers,
          grants: people.map((each) => ({
            containerId: each.on.id,
            granteeId: each.who,
            status: each.pending ? "pending" : "accepted",
          })),
          links: [],
          references: [],
        });
        const moved = tree.map((each) => (each.id === item.id ? { ...each, parentId: to } : each));
        const reads = (containers: typeof tree, who: string) =>
          readableContainers(access(containers), { kind: "person", userId: who }).has(item.id);
        const accepted = (line: typeof impact.added, who: string) =>
          line.some((each) => each.kind === "person" && each.id === who && !each.pending);
        for (const who of [anna, ben]) {
          const [before, after] = [reads(tree, who), reads(moved, who)];
          if (accepted(impact.removed, who)) expect(after).toBe(false);
          if (accepted(impact.added, who)) expect([before, after]).toEqual([false, true]);
          if (before && !after) expect(accepted(impact.removed, who)).toBe(true);
          if (!before && after) expect(accepted(impact.added, who)).toBe(true);
        }
      }),
    );
  });
});
