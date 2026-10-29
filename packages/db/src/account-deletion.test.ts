// Account deletion's storage (FR-11.10, FR-11.11, TS-74) against the local Postgres 18: confirming stops access
// and sharing at once and frees the address; the data job removes every row of the account, and nothing of
// another; it can run again; and the creator can't be deleted.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import {
  beginAccountDeletion,
  deleteAccountData,
  deletedEmailKey,
  deletionChunkSize,
  findAccountDeletion,
  finishAccountDeletion,
  pruneAccountDeletions,
  retryAccountDeletion,
} from "./account-deletion";
import { listMembers } from "./email-recoveries";
import {
  albums,
  auditLog,
  jobs,
  containers,
  oauthClients,
  oauthConsents,
  savedReferences,
  sessions,
  shareGrants,
  shareLinks,
  users,
} from "./schema";
import { executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: string;
let ben: string;

const principal = (userId: string): Principal => ({
  kind: "user",
  userId,
  role: "user",
  client: "web",
});
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest();

beforeEach(async () => {
  t = await createTestDatabase();
  anna = uuidv7();
  ben = uuidv7();
  await t.db.insert(users).values([
    { id: anna, email: "anna@example.com", displayName: "Anna" },
    { id: ben, email: "ben@example.com", displayName: "Ben" },
  ]);
});

afterEach(async () => {
  await t.drop();
});

async function run(userId: string, mutation: Omit<Mutation, "mutationId">) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const full = { mutationId: uuidv7(), ...mutation } as Mutation;
  const { result } = await executeMutation(t.db, principal(userId), full);
  expect(result.outcome.status).toBe("confirmed");
}

/** A folder with a list of two albums, a field, and a list in Trash: some of every kind of row. */
async function collection(userId: string): Promise<{ list: string }> {
  const folder = uuidv7();
  const list = uuidv7();
  await run(userId, {
    name: "container.create",
    args: { id: folder, kind: "folder", parentId: null, name: "Metal" },
  });
  await run(userId, {
    name: "container.create",
    args: { id: list, kind: "list", parentId: folder, name: "Doom" },
  });
  for (const title of ["Nightfall", "Epicus"]) {
    const id = uuidv7();
    // oxlint-disable-next-line no-await-in-loop
    await run(userId, {
      name: "album.create",
      args: {
        id,
        title,
        artistCredit: "Candlemass",
        releaseType: "album",
        isLive: false,
        originalYear: 1987,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    });
    // oxlint-disable-next-line no-await-in-loop
    await run(userId, { name: "membership.add", args: { listId: list, albumId: id } });
  }
  await run(userId, {
    name: "field.create",
    args: {
      id: uuidv7(),
      name: "Mood",
      type: "single_choice",
      options: [{ id: uuidv7(), label: "Dark" }],
    },
  });
  const trashed = uuidv7();
  await run(userId, {
    name: "container.create",
    args: { id: trashed, kind: "list", parentId: null, name: "Old" },
  });
  await run(userId, { name: "container.delete", args: { id: trashed, unitId: uuidv7() } });
  return { list };
}

const begin = (userId = anna) =>
  beginAccountDeletion(t.db, {
    userId,
    deletionId: uuidv7(),
    tokenHash: hash(`token-${userId}`),
    auditId: uuidv7(),
  });

/** Every row, in any table, with `userId` in a UUID column: none may stay but the audit log's and the job's. */
async function rowsOf(userId: string): Promise<string[]> {
  const columns = await t.db.$client<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = ${t.schema} and data_type = 'uuid'
      and table_name not in ('audit_log', 'account_deletions')`;
  const found: string[] = [];
  for (const { table_name, column_name } of columns) {
    // oxlint-disable-next-line no-await-in-loop
    const [row] = await t.db.$client<{ n: number }[]>`
      select count(*)::int as n from ${t.db.$client(table_name)} where ${t.db.$client(column_name)} = ${userId}`;
    if (row && row.n > 0) found.push(`${table_name}.${column_name}`);
  }
  return found;
}

describe("beginAccountDeletion", () => {
  test("frees the address, ends sessions and AI connections, stops sharing, records it, and queues the job", async () => {
    const { list } = await collection(anna);
    const bens = await collection(ben);
    const linkId = uuidv7();
    await t.db
      .insert(shareLinks)
      .values({ id: linkId, containerId: list, tokenHash: hash("link") });
    // Ben invited by Anna; Anna invited by Ben, with her reference to his list.
    await t.db.insert(shareGrants).values([
      {
        id: uuidv7(),
        containerId: list,
        granteeId: ben,
        invitedEmail: "ben@example.com",
        status: "accepted",
      },
      {
        id: uuidv7(),
        containerId: bens.list,
        granteeId: anna,
        invitedEmail: "anna@example.com",
        status: "accepted",
      },
    ]);
    await t.db.insert(savedReferences).values({ viewerId: anna, containerId: bens.list });
    await t.db
      .insert(sessions)
      .values({ id: uuidv7(), userId: anna, token: "s", expiresAt: new Date(Date.now() + 60_000) });
    await t.db.insert(oauthClients).values({ id: uuidv7(), clientId: "c", redirectUris: [] });
    await t.db
      .insert(oauthConsents)
      .values({ id: uuidv7(), clientId: "c", userId: anna, scopes: ["collection:read"] });

    expect(await begin()).toBe("started");
    const [account] = await t.db.select().from(users).where(eq(users.id, anna));
    expect(account).toMatchObject({ email: deletedEmailKey(anna), deletingAt: expect.any(Date) });
    expect(await t.db.select().from(sessions)).toEqual([]);
    expect(await t.db.select().from(oauthConsents)).toEqual([]);
    expect((await t.db.select().from(shareLinks))[0]?.revokedAt).toBeInstanceOf(Date);
    expect(
      Object.fromEntries(
        (await t.db.select().from(shareGrants)).map((grant) => [grant.granteeId, grant.status]),
      ),
    ).toEqual({ [ben]: "revoked", [anna]: "withdrawn" });
    expect(await t.db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        action: "account.delete",
        actor: anna,
        subject: anna,
        details: {},
      }),
    ]);
    expect((await t.db.select().from(jobs)).map((job) => job.kind)).toEqual(["account-deletion"]);
    expect((await findAccountDeletion(t.db, hash(`token-${anna}`)))?.status).toBe("deleting");
    // The creator's list never shows the placeholder.
    expect((await listMembers(t.db)).map((member) => member.email)).toEqual(["ben@example.com"]);
    expect(await begin()).toBe("deleting");
  });

  test("refuses the creator and an unknown account", async () => {
    const creator = uuidv7();
    await t.db.insert(users).values({ id: creator, email: "creator@example.com", role: "creator" });
    expect(await begin(creator)).toBe("creator");
    expect(await begin(uuidv7())).toBe("missing");
    expect(await t.db.select().from(auditLog)).toEqual([]);
  });
});

describe("deleteAccountData", () => {
  test("removes every row of the account, in chunks, and nothing of another's; again is harmless", async () => {
    await collection(anna);
    await collection(ben);
    // More albums than one chunk.
    await t.db.insert(albums).values(
      Array.from({ length: deletionChunkSize + 1 }, (_, index) => ({
        id: uuidv7(),
        ownerId: anna,
        title: `Album ${index}`,
        artistCredit: "Sleep",
        originalYear: 1999,
        searchTitleKey: `album ${index}`,
        searchArtistKey: "sleep",
      })),
    );
    await begin();
    await deleteAccountData(t.db, anna);

    expect(await rowsOf(anna)).toEqual([]);
    expect((await t.db.select().from(users)).map((user) => user.id)).toEqual([ben]);
    expect(await t.db.select().from(containers).where(eq(containers.ownerId, ben))).toHaveLength(3);
    expect(await t.db.select().from(albums).where(eq(albums.ownerId, ben))).toHaveLength(2);

    await deleteAccountData(t.db, anna);
    expect(await rowsOf(anna)).toEqual([]);
  });
});

describe("progress", () => {
  test("a failed deletion is queued again by retry, and finished ones are pruned after a week", async () => {
    await begin();
    const tokenHash = hash(`token-${anna}`);
    const deletion = await findAccountDeletion(t.db, tokenHash);
    if (!deletion) throw new Error("No deletion");
    expect(await retryAccountDeletion(t.db, tokenHash, { jobId: uuidv7() })).toBe("deleting");

    await finishAccountDeletion(t.db, deletion.id, "failed");
    expect(await retryAccountDeletion(t.db, tokenHash, { jobId: uuidv7() })).toBe("deleting");
    expect(await t.db.select().from(jobs)).toHaveLength(2);
    expect(await retryAccountDeletion(t.db, hash("unknown"), { jobId: uuidv7() })).toBeUndefined();

    const now = new Date();
    await finishAccountDeletion(t.db, deletion.id, "deleted", now);
    await pruneAccountDeletions(t.db, new Date(now.getTime() + 6 * 24 * 60 * 60_000));
    expect(await findAccountDeletion(t.db, tokenHash)).toBeDefined();
    await pruneAccountDeletions(t.db, new Date(now.getTime() + 8 * 24 * 60 * 60_000));
    expect(await findAccountDeletion(t.db, tokenHash)).toBeUndefined();
  });
});
