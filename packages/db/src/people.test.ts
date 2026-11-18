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

import { connections, people } from "./people";
import { shareGrants, users } from "./schema";
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
        email: null,
        sharedAt: expect.any(String),
        sharesWithYou: "Folk",
      },
      {
        id: anna,
        displayName: "Anna",
        email: "Anna@New.example",
        sharedAt: expect.any(String),
        sharesWithYou: null,
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
