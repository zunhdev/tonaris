// A person's people in Postgres (FR-07.23, TON-294): `connections` against the domain's `personThrough` over random
// grants, accounts being deleted left out, the address last typed, the newest share that opens, `accepted_at` set by
// `share.accept`, and `findPerson` agreeing with the read.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";
import * as fc from "fast-check";

import {
  personThrough,
  shareGrantStatuses,
  uuidv7,
  type Mutation,
  type Principal,
  type ShareGrantStatus,
} from "@tonaris/domain";

import { deleteAccountData } from "./account-deletion";
import { connections, favoritesOf, people, personShares } from "./people";
import { peopleHidden, profileFavorites, shareGrants, users } from "./schema";
import { sharingStore } from "./store/sharing";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newPerson(displayName: string | null = null): Promise<string> {
  const id = uuidv7();
  await t.db.insert(users).values({ id, email: `${id}@example.com`, displayName });
  return id;
}

async function grant(
  containerId: string,
  granteeId: string,
  status: ShareGrantStatus,
  { accepted = false, email = null }: { accepted?: boolean; email?: string | null } = {},
): Promise<string> {
  const id = uuidv7();
  await t.db.insert(shareGrants).values({
    id,
    containerId,
    granteeId,
    invitedEmail: email,
    status,
    acceptedAt: accepted ? new Date() : null,
  });
  return id;
}

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

const principal = (userId: string): Principal => ({
  kind: "user",
  userId,
  role: "user",
  client: "web",
});

async function run(userId: string, mutation: Unsent) {
  const { result } = await executeMutation(t.db, principal(userId), {
    mutationId: uuidv7(),
    ...mutation,
  });
  expect(result.outcome.status).toBe("confirmed");
}

/** The store's `findPerson`, in a transaction as commands run it. */
const findPerson = (userId: string, personId: string) =>
  t.db.transaction((tx) => sharingStore(tx).findPerson(userId, personId));

async function newList(ownerId: string, name = "List"): Promise<string> {
  const id = uuidv7();
  await run(ownerId, {
    name: "container.create",
    args: { id, kind: "list", parentId: null, name },
  });
  return id;
}

describe("connections (FR-07.23)", () => {
  test("follow `personThrough` over random grants", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            owner: fc.integer({ min: 0, max: 3 }),
            grantee: fc.integer({ min: 0, max: 3 }),
            status: fc.constantFrom(...shareGrantStatuses),
            accepted: fc.boolean(),
          }),
          { maxLength: 12 },
        ),
        async (drawn) => {
          // Fresh people each run, so earlier runs' grants touch none of them.
          const ids = await Promise.all([0, 1, 2, 3].map(() => newPerson("Someone")));
          const lists = await Promise.all(ids.map((id) => newList(id)));
          // One open grant per list and person (TS-11): later open ones are skipped.
          const open = new Set<string>();
          const made: {
            ownerId: string;
            granteeId: string;
            status: ShareGrantStatus;
            accepted: boolean;
          }[] = [];
          for (const { owner, grantee, status, accepted } of drawn) {
            const ownerId = ids[owner] ?? "";
            const granteeId = ids[grantee] ?? "";
            if (ownerId === granteeId) continue;
            const key = `${owner}:${grantee}`;
            if ((status === "pending" || status === "accepted") && open.has(key)) continue;
            if (status === "pending" || status === "accepted") open.add(key);
            const wasAccepted = status === "accepted" || (status !== "pending" && accepted);
            made.push({ ownerId, granteeId, status, accepted: wasAccepted });
          }
          await Promise.all(
            made.map(({ ownerId, granteeId, status, accepted }) =>
              grant(lists[ids.indexOf(ownerId)] ?? "", granteeId, status, { accepted }),
            ),
          );
          const found = await Promise.all(ids.map((userId) => connections(t.db, userId)));
          ids.forEach((userId, at) => {
            const expected = new Set(made.flatMap((each) => personThrough(each, userId) ?? []));
            expect(new Set(found[at]?.keys())).toEqual(expected);
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  test("leave out accounts being deleted, and nobody is their own person", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const doom = await newList(denis, "Doom");
    await grant(doom, anna, "pending", { email: "anna@example.com" });
    expect([...(await connections(t.db, denis)).keys()]).toEqual([anna]);
    await t.db.update(users).set({ deletingAt: new Date() }).where(eq(users.id, anna));
    expect((await connections(t.db, denis)).size).toBe(0);
    expect(await findPerson(denis, denis)).toBeUndefined();
  });
});

describe("people (FR-07.23)", () => {
  test("the address last typed, latest first, and the newest share of theirs that opens", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const ben = await newPerson("Ben");
    const doom = await newList(denis, "Doom");
    const jazz = await newList(denis, "Jazz");
    await grant(doom, anna, "revoked", { email: "anna@old.example" });
    await grant(jazz, anna, "accepted", { accepted: true, email: "Anna@New.example" });
    const folk = await newList(ben, "Folk");
    const soul = await newList(ben, "Soul");
    await grant(folk, denis, "accepted", { accepted: true });
    await grant(soul, denis, "accepted", { accepted: true });
    // Soul goes to Trash: it no longer opens, so Folk names Ben's share (FR-07.10).
    await run(ben, { name: "container.delete", args: { id: soul, unitId: uuidv7() } });

    expect(await people(t.db, denis)).toEqual([
      {
        id: ben,
        displayName: "Ben",
        avatarHue: null,
        email: null,
        sharedAt: expect.any(String),
        sharesWithYou: "Folk",
        yours: { folders: 0, lists: 0, toEdit: 0 },
        theirs: { folders: 0, lists: 1 },
      },
      {
        id: anna,
        displayName: "Anna",
        avatarHue: null,
        email: "Anna@New.example",
        sharedAt: expect.any(String),
        sharesWithYou: null,
        yours: { folders: 0, lists: 1, toEdit: 0 },
        theirs: { folders: 0, lists: 0 },
      },
    ]);
    expect(await findPerson(denis, anna)).toEqual({
      id: anna,
      email: "Anna@New.example",
    });
    expect(await findPerson(denis, ben)).toEqual({ id: ben, email: null });
  });

  test("someone with no name and no address typed isn't listed", async () => {
    const denis = await newPerson("Denis");
    const nameless = await newPerson(null);
    const theirs = await newList(nameless, "Theirs");
    await grant(theirs, denis, "withdrawn", { accepted: true });
    expect(await people(t.db, denis)).toEqual([]);
  });

  test("share.accept records when, and leaving keeps the connection", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const jazz = await newList(anna, "Jazz");
    const grantId = await grant(jazz, denis, "pending");
    expect((await connections(t.db, denis)).size).toBe(0);
    await run(denis, { name: "share.accept", args: { grantId } });
    const [row] = await t.db
      .select({ acceptedAt: shareGrants.acceptedAt })
      .from(shareGrants)
      .where(eq(shareGrants.id, grantId));
    expect(row?.acceptedAt).toBeInstanceOf(Date);
    await run(denis, { name: "share.leave", args: { containerId: jazz } });
    expect([...(await connections(t.db, denis)).keys()]).toEqual([anna]);
  });
});

describe("a person's page and hiding (FR-07.24)", () => {
  test("what's shared each way, by name: theirs pending or opening, yours outside Trash", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const metal = uuidv7();
    await run(denis, {
      name: "container.create",
      args: { id: metal, kind: "folder", parentId: null, name: "Metal" },
    });
    const doom = await newList(denis, "Doom");
    const old = await newList(denis, "Old");
    await grant(metal, anna, "accepted", { accepted: true, email: "anna@example.com" });
    await grant(doom, anna, "pending", { email: "anna@example.com" });
    await grant(old, anna, "pending", { email: "anna@example.com" });
    await t.db.update(shareGrants).set({ role: "edit" }).where(eq(shareGrants.containerId, metal));
    await run(denis, { name: "container.delete", args: { id: old, unitId: uuidv7() } });
    const jazz = await newList(anna, "Jazz");
    const blues = await newList(anna, "Blues");
    await grant(jazz, denis, "accepted", { accepted: true });
    await grant(blues, denis, "pending");

    const shares = await personShares(t.db, denis, anna);
    expect(shares?.person.yours).toEqual({ folders: 1, lists: 1, toEdit: 1 });
    expect(shares?.person.theirs).toEqual({ folders: 0, lists: 1 });
    expect(shares?.yours.map(({ name, kind, role, status }) => [name, kind, role, status])).toEqual(
      [
        ["Doom", "list", "view", "pending"],
        ["Metal", "folder", "edit", "accepted"],
      ],
    );
    expect(shares?.theirs.map(({ name, status }) => [name, status])).toEqual([
      ["Blues", "pending"],
      ["Jazz", "accepted"],
    ]);
    expect(await personShares(t.db, denis, await newPerson("Stranger"))).toBeUndefined();
  });

  test("hidden until a later invitation either way, and never findable meanwhile", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const doom = await newList(denis, "Doom");
    await grant(doom, anna, "accepted", { accepted: true, email: "anna@example.com" });
    await run(denis, { name: "people.remove", args: { personId: anna } });
    expect(await people(t.db, denis)).toEqual([]);
    expect(await findPerson(denis, anna)).toBeUndefined();
    expect(await personShares(t.db, denis, anna)).toBeUndefined();
    // Her invitation stays: removing revokes nothing.
    const [kept] = await t.db.select({ status: shareGrants.status }).from(shareGrants);
    expect(kept?.status).toBe("accepted");

    // Anna invites Denis; once he accepts, she's back.
    const jazz = await newList(anna, "Jazz");
    const fromAnna = await grant(jazz, denis, "pending");
    expect(await people(t.db, denis)).toEqual([]);
    await run(denis, { name: "share.accept", args: { grantId: fromAnna } });
    expect((await people(t.db, denis)).map((person) => person.id)).toEqual([anna]);
  });

  test("account deletion's purge removes hidden rows on both sides", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    await run(denis, { name: "people.remove", args: { personId: anna } });
    await run(anna, { name: "people.remove", args: { personId: denis } });
    expect(await t.db.select().from(peopleHidden)).toHaveLength(2);
    await deleteAccountData(t.db, anna);
    expect(await t.db.select().from(peopleHidden)).toEqual([]);
  });
});

async function newAlbum(ownerId: string, title: string): Promise<string> {
  const id = uuidv7();
  await run(ownerId, {
    name: "album.create",
    args: {
      id,
      title,
      artistCredit: "Someone",
      releaseType: "album",
      isLive: false,
      originalYear: 1990,
      recordingYearStart: null,
      recordingYearEnd: null,
    },
  });
  return id;
}

describe("favorite albums (FR-11.16, TON-297)", () => {
  test("in order; one in Trash hidden from their people and back in its place when restored; gone when purged", async () => {
    const denis = await newPerson("Denis");
    const anna = await newPerson("Anna");
    const doom = await newList(denis, "Doom");
    await grant(doom, anna, "accepted", { accepted: true, email: "anna@example.com" });
    const ids = await Promise.all(
      ["Nightfall", "Dopesmoker", "Homogenic"].map((title) => newAlbum(denis, title)),
    );
    const second = ids[1] ?? "";
    await run(denis, { name: "account.setFavorites", args: { albumIds: ids } });
    const seen = async () =>
      (await personShares(t.db, anna, denis))?.favorites.map((favorite) => favorite.title);
    expect(await seen()).toEqual(["Nightfall", "Dopesmoker", "Homogenic"]);
    // Nothing else of the album: no ID, year or links.
    expect(Object.keys((await personShares(t.db, anna, denis))?.favorites[0] ?? {})).toEqual([
      "title",
      "artistCredit",
      "artworkUrl",
    ]);

    const unitId = uuidv7();
    await run(denis, { name: "album.delete", args: { id: second, unitId } });
    expect(await seen()).toEqual(["Nightfall", "Homogenic"]);
    expect((await favoritesOf(t.db, denis)).map((favorite) => favorite.trashed)).toEqual([
      false,
      true,
      false,
    ]);
    await run(denis, { name: "trash.recover", args: { unitId } });
    expect(await seen()).toEqual(["Nightfall", "Dopesmoker", "Homogenic"]);

    const again = uuidv7();
    await run(denis, { name: "album.delete", args: { id: second, unitId: again } });
    await run(denis, { name: "trash.purge", args: { unitIds: [again] } });
    expect((await favoritesOf(t.db, denis)).map((favorite) => favorite.title)).toEqual([
      "Nightfall",
      "Homogenic",
    ]);
  });

  test("hidden from anyone who isn't one of their people; account deletion removes them", async () => {
    const denis = await newPerson("Denis");
    const ben = await newPerson("Ben");
    const nightfall = await newAlbum(denis, "Nightfall");
    await run(denis, { name: "account.setFavorites", args: { albumIds: [nightfall] } });
    // Ben invited Denis, who hasn't answered: Denis is one of Ben's people, but Ben isn't one of his.
    const folk = await newList(ben, "Folk");
    await grant(folk, denis, "pending");
    expect(await personShares(t.db, ben, denis)).toMatchObject({ favorites: [], about: null });
    await deleteAccountData(t.db, denis);
    expect(await t.db.select().from(profileFavorites)).toEqual([]);
  });
});
