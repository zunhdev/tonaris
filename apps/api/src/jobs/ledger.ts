// The revocation ledger's writer (TS-113): the `ledger.append` jobs that deletions and revocations queue, appended
// off-site through the store at LEDGER_URL. A failed append is retried by the queue (TS-90); a buried one keeps its
// event in the job's row, for the operator to queue again, since a restore needs every one.

import type { LedgerStore } from "@tonaris/db";
import { ledgerEventSchema, ledgerJobKind, type LedgerEvent } from "@tonaris/domain";

import type { JobHandler } from "./worker";

export function ledgerJob(store: LedgerStore): JobHandler {
  return {
    kind: ledgerJobKind,
    run: (job) => store.append(ledgerEventSchema.parse(job.payload)),
    buried: async (job) => job.payload,
  };
}

/** A ledger in memory, for tests: what was appended, in order. */
export function memoryLedger(): LedgerStore & { appended: LedgerEvent[] } {
  const appended: LedgerEvent[] = [];
  return {
    appended,
    append: async (event) => {
      appended.push(event);
    },
    events: async () => [...appended],
  };
}
