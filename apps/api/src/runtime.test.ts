// The API's wiring (TS-90, TS-113) against the local Postgres 18: the runtime's worker runs the jobs the API queues,
// whichever entry point built it. An email and a ledger event here; an account's deletion runs through the app in
// account-deletion.test.ts.

import { afterEach, beforeEach, expect, test } from "bun:test";

import { enqueueJob } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { ledgerJobKind, uuidv7, type LedgerEvent } from "@tonaris/domain";

import { apiConfig } from "./config";
import { memoryLedger } from "./jobs/ledger";
import { createRuntime } from "./runtime";
import { memoryEmail } from "./testing";

let t: TestDatabase;
let runtime: ReturnType<typeof createRuntime> | undefined;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  if (runtime) {
    runtime.hub.close();
    await runtime.worker.stop();
    await runtime.auth.$context;
  }
  runtime = undefined;
  await t.drop();
});

/** Waits until `done()` holds, polling every 10 ms for a second. */
async function eventually(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(10);
  }
}

test("the worker sends queued email through the transport and appends to the ledger", async () => {
  const transport = memoryEmail();
  const ledger = memoryLedger();
  runtime = createRuntime({ db: t.db, config: apiConfig({}), transport, ledger });

  const arrived = transport.next("anna@example.com");
  await runtime.email.send("sign-in-no-account", "anna@example.com", {});
  expect((await arrived).template).toBe("sign-in-no-account");

  const event: LedgerEvent = {
    id: uuidv7(),
    at: new Date().toISOString(),
    type: "account.deleted",
    userId: uuidv7(),
  };
  await enqueueJob(t.db, { id: uuidv7(), kind: ledgerJobKind, payload: event });
  runtime.worker.wake();
  await eventually(() => ledger.appended.length > 0);
  expect(ledger.appended).toEqual([event]);
});
