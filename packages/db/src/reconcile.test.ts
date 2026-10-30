// Reconciling a restored database against the local Postgres 18 (TS-113): the ledger's events from just before the
// restore point are replayed, older ones aren't, and no session survives.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { uuidv7 } from "@tonaris/domain";

import { ledgerStore } from "./ledger";
import { reconcileRestored } from "./reconcile";
import { sessions, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let dir: string;

beforeEach(async () => {
  t = await createTestDatabase();
  dir = await mkdtemp(path.join(tmpdir(), "tonaris-reconcile-"));
});

afterEach(async () => {
  await t.drop();
  await rm(dir, { recursive: true, force: true });
});

test("replays the events since just before the restore point, and ends every session", async () => {
  const restoredTo = new Date("2026-11-02T14:30:00Z");
  const minutes = (n: number) => new Date(restoredTo.getTime() + n * 60_000).toISOString();
  const [anna, before, margin, after] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  await t.db.insert(users).values([
    { id: anna, email: "anna@example.com" },
    { id: before, email: "before@example.com" },
    { id: margin, email: "margin@example.com" },
    { id: after, email: "after@example.com" },
  ]);
  await t.db.insert(sessions).values({
    id: uuidv7(),
    userId: anna,
    token: "token",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const ledger = ledgerStore(pathToFileURL(dir).href);
  // An hour before the restore point is in the restored database already; five minutes before may not be.
  await ledger.append({ id: uuidv7(), at: minutes(-60), type: "account.deleted", userId: before });
  await ledger.append({ id: uuidv7(), at: minutes(-5), type: "account.deleted", userId: margin });
  await ledger.append({ id: uuidv7(), at: minutes(5), type: "account.deleted", userId: after });

  const report = await reconcileRestored(t.db, ledger, restoredTo);
  expect(report.replayed["account.deleted"]).toBe(2);
  const left = (await t.db.select({ id: users.id }).from(users)).map((user) => user.id);
  expect(left.toSorted()).toEqual([anna, before].toSorted());
  expect(await t.db.select().from(sessions)).toEqual([]);
  expect(report.accounts).toBe(2);
});
