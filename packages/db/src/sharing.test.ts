// Reads through sharing in Postgres (FR-07.8–FR-07.12, FR-07.16; TS-31 to TS-33): the recursive CTEs against the
// domain's model over random states, links found by their token's hash, the shared snapshot, and AC-20's and
// AC-30's transitions through the real commands.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";
import * as fc from "fast-check";

import {
  nameKey,
  readableContainers as modelReadable,
  searchKey,
  shareGrantStatuses,
  shareToken,
  shareTokenHash,
  trashRetentionDays,
  uuidv7,
  type Container,
  type Mutation,
  type Principal,
  type ShareGrantStatus,
  type ShareViewer,
  type SharingState,
} from "@tonaris/domain";

import {
  albumServiceLinks,
  containers,
  savedReferences,
  shareGrants,
  shareLinks,
  trashUnits,
  users,
} from "./schema";
import { canReadContainer, findShareLink, readableContainers, sharedSnapshot } from "./sharing";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newPrincipal(
  displayName: string | null = null,
): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com`, displayName });
  return { kind: "user", userId, role: "user", client: "web" };
}

const person = (principal: { userId: string }): ShareViewer => ({
  kind: "person",
  userId: principal.userId,
});

/** Pending and accepted grants are open: one per container and person (TS-11). */
const open = (status: string) => status === "pending" || status === "accepted";

const album = (title: string, artistCredit: string) => ({
  id: uuidv7(),
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
});

/** A mutation without its ID, which `run` gives it. */
type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function run(principal: Principal, mutation: Unsent) {
  const { result } = await executeMutation(t.db, principal, {
    mutationId: uuidv7(),
    ...mutation,
  });
  expect(result.outcome.status).toBe("confirmed");
  return result;
}

async function made(
  principal: Principal,
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Promise<Container> {
  const container: Container = { id: uuidv7(), kind, parentId, name, description: null };
  await run(principal, { name: "container.create", args: container });
  return container;
}

async function grant(
  containerId: string,
  granteeId: string,
  status: ShareGrantStatus = "accepted",
) {
  await t.db
    .insert(shareGrants)
    .values({ id: uuidv7(), containerId, granteeId, invitedEmail: "someone@example.com", status });
}

const secret = "test secret";

/** A live link on `containerId`, stored as the commands store it: by its token's hash. */
async function link(containerId: string, id = uuidv7()) {
  const token = await shareToken(secret, id);
  const hash = await shareTokenHash(token);
  await t.db.insert(shareLinks).values({ id, containerId, tokenHash: Buffer.from(hash) });
  return { id, token };
}

describe("the CTEs agree with the model (TS-31)", () => {
  /** Containers each under an earlier folder or the root, trashed or not; shares and references on any of them. */
  const states = fc.record({
    tree: fc.array(
      fc.record({
        folder: fc.boolean(),
        parent: fc.option(fc.nat(), { nil: null }),
        trashed: fc.boolean(),
      }),
      { minLength: 1, maxLength: 10 },
    ),
    grants: fc.array(
      fc.record({
        pick: fc.nat(),
        anna: fc.boolean(),
        status: fc.constantFrom(...shareGrantStatuses),
      }),
      { maxLength: 5 },
    ),
    links: fc.array(fc.record({ pick: fc.nat(), revoked: fc.boolean(), saved: fc.boolean() }), {
      maxLength: 4,
    }),
  });

  test("readable containers and the read check, for people and links", async () => {
    const owner = await newPrincipal();
    const anna = await newPrincipal();
    const ben = await newPrincipal();
    await fc.assert(
      fc.asyncProperty(states, async (plan) => {
        // A fresh tree each run; earlier runs' rows stay, belonging to other containers.
        const unitId = uuidv7();
        await t.db.insert(trashUnits).values({
          id: unitId,
          ownerId: owner.userId,
          kind: "folder",
          rootId: unitId,
          deletedAt: new Date(),
          expiresAt: new Date(Date.now() + trashRetentionDays * 86_400_000),
        });
        const tree: SharingState["containers"][number][] = [];
        for (const each of plan.tree) {
          const folders = tree.filter((_, at) => plan.tree[at]?.folder);
          const parentId =
            each.parent === null || folders.length === 0
              ? null
              : (folders[each.parent % folders.length]?.id ?? null);
          tree.push({ id: uuidv7(), parentId, trashed: each.trashed });
        }
        await t.db.insert(containers).values(
          tree.map(({ id, parentId, trashed }, index) => ({
            id,
            ownerId: owner.userId,
            kind: plan.tree[index]?.folder ? ("folder" as const) : ("list" as const),
            parentId,
            // Unique across runs, which share the owner.
            name: id,
            nameKey: nameKey(id),
            searchNameKey: searchKey(id),
            ...(trashed ? { trashedAt: new Date(), trashUnitId: unitId } : {}),
          })),
        );
        const pickId = (pick: number) => tree[pick % tree.length]!.id;
        // One open grant per container and person, as the index requires.
        const grants: SharingState["grants"][number][] = [];
        for (const each of plan.grants) {
          const row = {
            containerId: pickId(each.pick),
            granteeId: each.anna ? anna.userId : ben.userId,
            status: each.status,
          };
          if (
            open(row.status) &&
            grants.some(
              (other) =>
                other.containerId === row.containerId &&
                other.granteeId === row.granteeId &&
                open(other.status),
            )
          )
            continue;
          grants.push(row);
        }
        if (grants.length > 0)
          await t.db.insert(shareGrants).values(
            grants.map((each) => ({
              id: uuidv7(),
              invitedEmail: "someone@example.com",
              ...each,
            })),
          );
        // One live link per container, as the index requires.
        const links: (SharingState["links"][number] & { saved: boolean })[] = [];
        for (const each of plan.links) {
          const containerId = pickId(each.pick);
          const revoked =
            each.revoked ||
            links.some((other) => other.containerId === containerId && !other.revoked);
          links.push({ id: uuidv7(), containerId, revoked, saved: each.saved });
        }
        for (const each of links) {
          // oxlint-disable-next-line no-await-in-loop
          const hash = await shareTokenHash(await shareToken(secret, each.id));
          // oxlint-disable-next-line no-await-in-loop
          await t.db.insert(shareLinks).values({
            id: each.id,
            containerId: each.containerId,
            tokenHash: Buffer.from(hash),
            revokedAt: each.revoked ? new Date() : null,
          });
        }
        // Anna's saved references, one per container.
        const references: SharingState["references"][number][] = [];
        for (const each of links) {
          if (!each.saved || references.some((other) => other.containerId === each.containerId))
            continue;
          references.push({
            viewerId: anna.userId,
            containerId: each.containerId,
            linkId: each.id,
          });
        }
        if (references.length > 0) await t.db.insert(savedReferences).values(references);

        const state: SharingState = { containers: tree, grants, links, references };
        const viewers: ShareViewer[] = [
          person(anna),
          person(ben),
          ...links.map((each): ShareViewer => ({ kind: "link", linkId: each.id })),
        ];
        for (const viewer of viewers) {
          const expected = modelReadable(state, viewer);
          // oxlint-disable-next-line no-await-in-loop
          const found = await readableContainers(t.db, viewer);
          const ours = new Map([...found].filter(([id]) => tree.some((each) => each.id === id)));
          expect(ours).toEqual(expected);
          // oxlint-disable-next-line no-await-in-loop
          const checks = await Promise.all(
            tree.map(({ id }) => canReadContainer(t.db, viewer, id)),
          );
          expect(checks).toEqual(tree.map(({ id }) => expected.has(id)));
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe("links (TS-32)", () => {
  test("a token opens its live link, found by hash; revoked or unknown, nothing", async () => {
    const owner = await newPrincipal();
    const doom = await made(owner, "list", "Doom");
    const { id, token } = await link(doom.id);
    expect(await findShareLink(t.db, token)).toEqual({
      id,
      containerId: doom.id,
      ownerId: owner.userId,
    });
    const [stored] = await t.db.select().from(shareLinks).where(eq(shareLinks.id, id));
    expect(Buffer.from(stored!.tokenHash).toString("utf8")).not.toContain(token);
    await t.db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, id));
    expect(await findShareLink(t.db, token)).toBeUndefined();
    expect(await findShareLink(t.db, await shareToken(secret, uuidv7()))).toBeUndefined();
  });
});

describe("the shared snapshot (FR-07.11, FR-07.12)", () => {
  test("the active subtree, its albums and links, the fields they use, and the owner's name", async () => {
    const owner = await newPrincipal("Denis");
    const anna = await newPrincipal();
    const metal = await made(owner, "folder", "Metal");
    await run(owner, {
      name: "container.describe",
      args: { id: metal.id, description: "Heavy things" },
      base: { description: null },
    });
    const doom = await made(owner, "list", "Doom", metal.id);
    const gone = await made(owner, "list", "Gone", metal.id);
    const unshared = await made(owner, "list", "Grunge");
    const nightfall = album("Nightfall", "Candlemass");
    const bleach = album("Bleach", "Nirvana");
    const trashed = album("Lost", "Nobody");
    for (const each of [nightfall, bleach, trashed]) {
      // oxlint-disable-next-line no-await-in-loop
      await run(owner, { name: "album.create", args: each });
    }
    await run(owner, { name: "membership.add", args: { listId: doom.id, albumId: nightfall.id } });
    await run(owner, { name: "membership.add", args: { listId: doom.id, albumId: trashed.id } });
    await run(owner, { name: "membership.add", args: { listId: gone.id, albumId: bleach.id } });
    await run(owner, { name: "membership.add", args: { listId: unshared.id, albumId: bleach.id } });
    const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";
    await t.db.insert(albumServiceLinks).values({
      albumId: nightfall.id,
      ownerId: owner.userId,
      service: "spotify",
      url: spotify,
      entityId: "1KQ1Pf4ikoK1jBbOtOHvOv",
    });
    const [mood, calm, heavy, rating, era] = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await run(owner, {
      name: "field.create",
      args: {
        id: mood,
        name: "Mood",
        type: "single_choice",
        options: [
          { id: calm, label: "Calm" },
          { id: heavy, label: "Heavy" },
        ],
      },
    });
    await run(owner, {
      name: "field.create",
      args: { id: rating, name: "Rating", type: "number", options: [] },
    });
    await run(owner, {
      name: "field.create",
      args: { id: era, name: "Era", type: "text", options: [] },
    });
    await run(owner, { name: "fieldValue.apply", args: { albumId: nightfall.id, fieldId: mood } });
    await run(owner, {
      name: "fieldValue.set",
      args: { albumId: nightfall.id, fieldId: mood, value: heavy },
      base: { value: null },
    });
    await run(owner, { name: "fieldValue.apply", args: { albumId: bleach.id, fieldId: rating } });
    await run(owner, { name: "album.delete", args: { id: trashed.id, unitId: uuidv7() } });
    await run(owner, { name: "container.delete", args: { id: gone.id, unitId: uuidv7() } });
    await grant(metal.id, anna.userId);

    const snapshot = await sharedSnapshot(t.db, person(anna), metal.id);
    expect(snapshot?.rootId).toBe(metal.id);
    expect(snapshot?.owner).toEqual({ displayName: "Denis" });
    expect(snapshot?.containers).toEqual([{ ...metal, description: "Heavy things" }, { ...doom }]);
    expect(snapshot?.albums.map(({ title }) => title)).toEqual(["Nightfall"]);
    expect(snapshot?.links).toEqual([{ albumId: nightfall.id, service: "spotify", url: spotify }]);
    expect(snapshot?.memberships.map(({ listId, albumId }) => [listId, albumId])).toEqual([
      [doom.id, nightfall.id],
    ]);
    expect(snapshot?.fields).toEqual([
      { id: mood, name: "Mood", type: "single_choice", options: [{ id: heavy, label: "Heavy" }] },
    ]);
    expect(snapshot?.fieldValues).toEqual([{ albumId: nightfall.id, fieldId: mood, value: heavy }]);

    // A list shared on its own: its private parent stays unknown.
    const ben = await newPrincipal();
    await grant(doom.id, ben.userId);
    const doomOnly = await sharedSnapshot(t.db, person(ben), doom.id);
    expect(doomOnly?.containers).toEqual([{ ...doom, parentId: null }]);
    // Nothing for someone without access, nor for the unshared list.
    expect(await sharedSnapshot(t.db, person(ben), metal.id)).toBeUndefined();
    expect(await sharedSnapshot(t.db, person(anna), unshared.id)).toBeUndefined();
  });
});

describe("AC-20 and AC-30 through the commands", () => {
  test("new content inherits; moves update access and keep direct shares", async () => {
    const owner = await newPrincipal();
    const anna = await newPrincipal();
    const metal = await made(owner, "folder", "Metal");
    await grant(metal.id, anna.userId);
    const inside = await made(owner, "list", "Doom", metal.id);
    const outside = await made(owner, "list", "Private");
    const readable = async () => new Set((await readableContainers(t.db, person(anna))).keys());
    expect(await readable()).toEqual(new Set([metal.id, inside.id]));

    // Moved in, it gains Metal's audience; moved out, it loses it.
    await run(owner, {
      name: "container.move",
      args: { id: outside.id, parentId: metal.id },
      base: { parentId: null },
    });
    expect(await readable()).toEqual(new Set([metal.id, inside.id, outside.id]));
    const doomLink = await link(inside.id);
    await run(owner, {
      name: "container.move",
      args: { id: inside.id, parentId: null },
      base: { parentId: metal.id },
    });
    expect(await readable()).toEqual(new Set([metal.id, outside.id]));
    // Its own link stays.
    expect(await canReadContainer(t.db, { kind: "link", linkId: doomLink.id }, inside.id)).toBe(
      true,
    );
  });

  test("Trash suspends; recovery resumes accepted and live, keeps pending pending and revoked revoked", async () => {
    const owner = await newPrincipal();
    const anna = await newPrincipal();
    const ben = await newPrincipal();
    const metal = await made(owner, "folder", "Metal");
    const doom = await made(owner, "list", "Doom", metal.id);
    await grant(metal.id, anna.userId);
    await grant(metal.id, ben.userId, "pending");
    const kept = await link(metal.id);
    const unitId = uuidv7();
    await run(owner, { name: "container.delete", args: { id: metal.id, unitId } });
    expect((await readableContainers(t.db, person(anna))).size).toBe(0);
    expect(await canReadContainer(t.db, { kind: "link", linkId: kept.id }, doom.id)).toBe(false);
    expect(await sharedSnapshot(t.db, person(anna), metal.id)).toBeUndefined();

    await run(owner, { name: "trash.recover", args: { unitId } });
    expect(await readableContainers(t.db, person(anna))).toEqual(
      new Map([
        [metal.id, new Set([metal.id])],
        [doom.id, new Set([metal.id])],
      ]),
    );
    expect(await findShareLink(t.db, kept.token)).toMatchObject({
      id: kept.id,
      containerId: metal.id,
    });
    expect((await readableContainers(t.db, person(ben))).size).toBe(0);

    // A link turned off while in Trash stays off after recovery.
    const unit2 = uuidv7();
    await run(owner, { name: "container.delete", args: { id: metal.id, unitId: unit2 } });
    await t.db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, kept.id));
    await run(owner, { name: "trash.recover", args: { unitId: unit2 } });
    expect(await findShareLink(t.db, kept.token)).toBeUndefined();
    expect(await canReadContainer(t.db, { kind: "link", linkId: kept.id }, metal.id)).toBe(false);
  });
});
