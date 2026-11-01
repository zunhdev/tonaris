// Approvals in Postgres (TS-64): a stored scope read back through its schema, for the page and the batch, and one
// approval's use: once, by its own connection, while approved, unexpired and of the same scope.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { albumDeletionScope, scopeHash, uuidv7 } from "@tonaris/domain";

import {
  createApproval,
  decideApproval,
  findApproval,
  pendingApprovals,
  useApproval,
} from "./approvals";
import { approvals, oauthClients, oauthConsents, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function asked() {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  await t.db
    .insert(oauthClients)
    .values({ id: uuidv7(), clientId: "c", name: "Agent", redirectUris: [] });
  const grantId = uuidv7();
  await t.db.insert(oauthConsents).values({ id: grantId, clientId: "c", userId, scopes: [] });
  const scope = albumDeletionScope([
    { id: uuidv7(), title: "Bleach", artist: "Nirvana", lists: [] },
  ]);
  const id = uuidv7();
  const hash = await scopeHash(scope);
  await createApproval(t.db, {
    id,
    accountId: userId,
    grantId,
    operation: "delete_albums",
    args: { albumIds: scope.albums.map((album) => album.id) },
    scope,
    scopeHash: hash,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return { id, userId, grantId, scope, hash };
}

describe("approvals (TS-64)", () => {
  test("its scope reads back as written, on its own and among the pending", async () => {
    const { id, userId, scope } = await asked();
    expect(await findApproval(t.db, id)).toMatchObject({ id, scope, clientName: "Agent" });
    expect(await pendingApprovals(t.db, userId)).toMatchObject([{ id, scope }]);
  });

  test("a stored scope that isn't one is refused, not passed on", async () => {
    const { id } = await asked();
    await t.db.execute(
      sql`update ${approvals} set scope = '{"operation": "delete_albums"}'::jsonb where id = ${id}`,
    );
    const refused = await findApproval(t.db, id).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(Error);
  });

  test("an approved one is used once, by its batch; another scope is told apart from an unusable one", async () => {
    const { id, userId, grantId, hash } = await asked();
    const use = (scope: string, batchId = uuidv7()) =>
      t.db.transaction((tx) => useApproval(tx, { id, grantId, scopeHash: scope, batchId }));
    expect(await use(hash)).toBe("not_usable");
    expect(await decideApproval(t.db, { accountId: userId, id, decision: "approve" })).toBe(true);
    expect(await use("another scope")).toBe("scope_changed");
    const batchId = uuidv7();
    expect(await use(hash, batchId)).toBe("used");
    expect(await use(hash, batchId)).toBe("used");
    expect(await use(hash)).toBe("not_usable");
  });
});
