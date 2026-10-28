// Read access through sharing (FR-07.6, FR-07.8–FR-07.10, FR-07.16; TS-31, TS-32): link tokens, the sources a
// viewer reads through, and, as properties over random trees run through the real commands, inheritance across
// moves, Trash suspension and recovery, and revocations that stay in effect.

import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import {
  readableContainers,
  shareGrantStatuses,
  shareToken,
  shareTokenHash,
  sourcesOf,
  viewerOf,
  type ShareViewer,
  type SharingState,
} from "./sharing";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna = uuidv7();
const ben = uuidv7();
const annaViews: ShareViewer = { kind: "person", userId: anna };

const node = (id: string, parentId: string | null = null, trashed = false) => ({
  id,
  parentId,
  trashed,
});
const state = (values: Partial<SharingState>): SharingState => ({
  containers: [],
  grants: [],
  links: [],
  references: [],
  ...values,
});

describe("link tokens (TS-32)", () => {
  test("256 bits as 43 base64url characters, the same for a link, different across links and secrets", async () => {
    const [one, two] = [uuidv7(), uuidv7()];
    const token = await shareToken("secret", one);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await shareToken("secret", one)).toBe(token);
    expect(await shareToken("secret", two)).not.toBe(token);
    expect(await shareToken("another secret", one)).not.toBe(token);
    const hash = await shareTokenHash(token);
    expect(hash).toHaveLength(32);
    expect(await shareTokenHash(token)).toEqual(hash);
  });
});

describe("viewers (TS-30)", () => {
  test("people and their MCP connections read as the person; guests through their link", () => {
    expect(viewerOf({ kind: "user", userId: anna, role: "user", client: "web" })).toEqual(
      annaViews,
    );
    expect(viewerOf({ kind: "mcp", userId: anna, grantId: uuidv7(), mode: "read_only" })).toEqual(
      annaViews,
    );
    const linkId = uuidv7();
    expect(viewerOf({ kind: "guest", linkId, rootId: uuidv7() })).toEqual({ kind: "link", linkId });
  });
});

describe("the access model (FR-07.6, FR-07.8, FR-07.10, FR-07.16)", () => {
  const [metal, doom, funeral, deep, other] = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const tree = [
    node(metal),
    node(doom, metal),
    node(funeral, metal),
    node(deep, funeral),
    node(other),
  ];

  test("only accepted grants are sources", () => {
    for (const status of shareGrantStatuses) {
      const sources = sourcesOf(
        state({ grants: [{ containerId: metal, granteeId: anna, status }] }),
        annaViews,
      );
      expect([status, [...sources]]).toEqual([status, status === "accepted" ? [metal] : []]);
    }
  });

  test("a saved reference reads through its link while it is live; a guest through theirs", () => {
    const linkId = uuidv7();
    const links = [{ id: linkId, containerId: doom, revoked: false }];
    const references = [{ viewerId: anna, containerId: doom, linkId }];
    expect([...sourcesOf(state({ links, references }), annaViews)]).toEqual([doom]);
    expect([...sourcesOf(state({ links, references }), { kind: "person", userId: ben })]).toEqual(
      [],
    );
    const revoked = [{ ...links[0]!, revoked: true }];
    expect([...sourcesOf(state({ links: revoked, references }), annaViews)]).toEqual([]);
    expect([...sourcesOf(state({ links }), { kind: "link", linkId })]).toEqual([doom]);
    expect([...sourcesOf(state({ links: revoked }), { kind: "link", linkId })]).toEqual([]);
    // A reference made only from a grant names no link, and reads through nothing by itself.
    expect([
      ...sourcesOf(
        state({ references: [{ viewerId: anna, containerId: doom, linkId: null }] }),
        annaViews,
      ),
    ]).toEqual([]);
  });

  test("a folder share covers its active descendants; Trash cuts the walk", () => {
    const grants = [{ containerId: metal, granteeId: anna, status: "accepted" as const }];
    const readable = readableContainers(state({ containers: tree, grants }), annaViews);
    expect(new Set(readable.keys())).toEqual(new Set([metal, doom, funeral, deep]));
    expect(readable.get(deep)).toEqual(new Set([metal]));

    const funeralTrashed = tree.map((each) =>
      each.id === funeral ? { ...each, trashed: true } : each,
    );
    expect(
      new Set(readableContainers(state({ containers: funeralTrashed, grants }), annaViews).keys()),
    ).toEqual(new Set([metal, doom]));
    const metalTrashed = tree.map((each) =>
      each.id === metal ? { ...each, trashed: true } : each,
    );
    expect(readableContainers(state({ containers: metalTrashed, grants }), annaViews).size).toBe(0);
  });

  test("a container read through two sources lists both", () => {
    const grants = [
      { containerId: metal, granteeId: anna, status: "accepted" as const },
      { containerId: funeral, granteeId: anna, status: "accepted" as const },
    ];
    const readable = readableContainers(state({ containers: tree, grants }), annaViews);
    expect(readable.get(deep)).toEqual(new Set([metal, funeral]));
    expect(readable.get(doom)).toEqual(new Set([metal]));
  });
});

/**
 * The upward reading of the same rule, which the database's read check uses (TS-31): from the container up while
 * every node is active, is any of them a source?
 */
function readsUpward(sharing: SharingState, viewer: ShareViewer, id: string): boolean {
  const byId = new Map(sharing.containers.map((each) => [each.id, each]));
  const sources = sourcesOf(sharing, viewer);
  for (let at = byId.get(id); at && !at.trashed;) {
    if (sources.has(at.id)) return true;
    at = at.parentId === null ? undefined : byId.get(at.parentId);
  }
  return false;
}

describe("access across moves, Trash and revocation, as properties", () => {
  const principal: Principal = { kind: "user", userId: owner, role: "user", client: "web" };

  /** A forest of folders and lists: each one's parent is an earlier folder, or the root. */
  const forest = fc
    .array(fc.record({ folder: fc.boolean(), parent: fc.option(fc.nat(), { nil: null }) }), {
      minLength: 1,
      maxLength: 12,
    })
    .map((shape) => {
      const made: StoredContainer[] = [];
      for (const [index, each] of shape.entries()) {
        const folders = made.filter((one) => one.kind === "folder");
        const parent =
          each.parent === null || folders.length === 0
            ? null
            : (folders[each.parent % folders.length]?.id ?? null);
        made.push({
          id: uuidv7(),
          kind: each.folder ? "folder" : "list",
          parentId: parent,
          name: `C${index}`,
          description: null,
          ownerId: owner,
          trashed: false,
        });
      }
      return made;
    });
  /** Grants to Anna and Ben of every status, and links, each on a random container. */
  const shares = fc.record({
    grants: fc.array(
      fc.record({
        pick: fc.nat(),
        anna: fc.boolean(),
        status: fc.constantFrom(...shareGrantStatuses),
      }),
      { maxLength: 4 },
    ),
    links: fc.array(fc.record({ pick: fc.nat(), saved: fc.boolean() }), { maxLength: 3 }),
  });
  const steps = fc.array(
    fc.record({
      kind: fc.constantFrom("move", "trash", "revoke"),
      pick: fc.nat(),
      to: fc.option(fc.nat(), { nil: null }),
    }),
    { maxLength: 16 },
  );

  test("every step leaves the model equal to its upward reading; Trash suspends, recovery resumes", async () => {
    await fc.assert(
      fc.asyncProperty(forest, shares, steps, async (tree, plan, path) => {
        const { store, containers } = memoryStore({ containers: tree });
        let clock = Date.parse("2026-10-29T12:00:00Z");
        const run = async (mutation: Mutation): Promise<CommandResult> => {
          clock += 60_000;
          return runCommand(mutationSchema.parse(mutation), {
            principal,
            store,
            now: new Date(clock),
          });
        };
        const ids = tree.map((each) => each.id);
        const pickId = (pick: number) => ids[pick % ids.length]!;
        const grants = plan.grants.map((each) => ({
          containerId: pickId(each.pick),
          granteeId: each.anna ? anna : ben,
          status: each.status,
        }));
        const links = plan.links.map((each) => ({
          id: uuidv7(),
          containerId: pickId(each.pick),
          revoked: false,
        }));
        const references = plan.links.flatMap((each, at) =>
          each.saved
            ? [{ viewerId: anna, containerId: links[at]!.containerId, linkId: links[at]!.id }]
            : [],
        );
        const snapshot = (): SharingState => ({
          containers: [...containers.values()].map(({ id, parentId, trashed }) =>
            node(id, parentId, trashed),
          ),
          grants,
          links,
          references,
        });
        const viewers: ShareViewer[] = [
          annaViews,
          { kind: "person", userId: ben },
          ...links.map((link): ShareViewer => ({ kind: "link", linkId: link.id })),
        ];
        const readableNow = () =>
          viewers.map((viewer) => [...readableContainers(snapshot(), viewer).keys()].toSorted());
        const checkUpward = () => {
          const now = snapshot();
          for (const viewer of viewers) {
            const readable = readableContainers(now, viewer);
            for (const id of ids) expect(readable.has(id)).toBe(readsUpward(now, viewer, id));
          }
        };

        checkUpward();
        for (const step of path) {
          const target = containers.get(pickId(step.pick));
          if (!target) continue;
          if (step.kind === "move" && !target.trashed) {
            const folders = [...containers.values()].filter(
              (each) => each.kind === "folder" && !each.trashed,
            );
            const to =
              step.to === null || folders.length === 0
                ? null
                : folders[step.to % folders.length]!.id;
            const before = readableNow();
            // oxlint-disable-next-line no-await-in-loop
            const result = await run({
              mutationId: uuidv7(),
              name: "container.move",
              args: { id: target.id, parentId: to },
              base: { parentId: target.parentId },
            });
            if (result.status !== "applied") expect(readableNow()).toEqual(before);
            // The moved container takes the destination's audience (FR-07.9).
            if (result.status === "applied" && to !== null) {
              for (const viewer of viewers) {
                const readable = readableContainers(snapshot(), viewer);
                if (readable.has(to)) expect(readable.has(target.id)).toBe(true);
              }
            }
          } else if (step.kind === "trash" && !target.trashed) {
            const before = readableNow();
            const unitId = uuidv7();
            // oxlint-disable-next-line no-await-in-loop
            const deleted = await run({
              mutationId: uuidv7(),
              name: "container.delete",
              args: { id: target.id, unitId },
            });
            expect(deleted.status).toBe("applied");
            // Nothing in Trash is readable (FR-07.10).
            for (const viewer of viewers) {
              expect(readableContainers(snapshot(), viewer).has(target.id)).toBe(false);
            }
            // Recovery to where it was resumes exactly what was readable before.
            // oxlint-disable-next-line no-await-in-loop
            const recovered = await run({
              mutationId: uuidv7(),
              name: "trash.recover",
              args: { unitId },
            });
            expect(recovered.status).toBe("applied");
            expect(readableNow()).toEqual(before);
          } else if (step.kind === "revoke") {
            // Revoking a link, or withdrawing a grant, never gives anyone more.
            const before = readableNow();
            const link = links[step.pick % Math.max(links.length, 1)];
            const grant = grants[step.pick % Math.max(grants.length, 1)];
            if (step.to === null && link) link.revoked = true;
            else if (grant) grant.status = step.to === null ? "revoked" : "withdrawn";
            const after = readableNow();
            for (const [at, readable] of after.entries()) {
              for (const id of readable) expect(before[at]).toContain(id);
            }
          }
          checkUpward();
        }
      }),
      { numRuns: 150 },
    );
  });

  test("a revocation made while content is in Trash stays in effect after recovery", async () => {
    const metal: StoredContainer = {
      id: uuidv7(),
      kind: "folder",
      parentId: null,
      name: "Metal",
      description: null,
      ownerId: owner,
      trashed: false,
    };
    const { store, containers } = memoryStore({ containers: [metal] });
    const run = (mutation: Mutation) =>
      runCommand(mutationSchema.parse(mutation), { principal, store, now: new Date() });
    const link = { id: uuidv7(), containerId: metal.id, revoked: false };
    const pending = { containerId: metal.id, granteeId: ben, status: "pending" as const };
    const accepted = { containerId: metal.id, granteeId: anna, status: "accepted" as const };
    const now = (): SharingState => ({
      containers: [...containers.values()].map(({ id, parentId, trashed }) =>
        node(id, parentId, trashed),
      ),
      grants: [accepted, pending],
      links: [link],
      references: [],
    });
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "container.delete", args: { id: metal.id, unitId } });
    link.revoked = true;
    await run({ mutationId: uuidv7(), name: "trash.recover", args: { unitId } });
    // The accepted grant resumes; the pending one stays pending; the revoked link stays dead.
    expect(readableContainers(now(), annaViews).has(metal.id)).toBe(true);
    expect(readableContainers(now(), { kind: "person", userId: ben }).size).toBe(0);
    expect(readableContainers(now(), { kind: "link", linkId: link.id }).size).toBe(0);
  });
});
