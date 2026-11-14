// The revocation ledger's writer (TS-113): the `ledger.append` jobs that deletions and revocations queue, appended
// off-site through the store at LEDGER_URL. A restore needs every event, and nothing else would write one again, so
// a failed append is never buried: the queue retries it every 2 minutes once its usual waits run out, until the
// ledger takes it (TS-90), and reports once that it is still retrying.

import type { LedgerStore } from "@tonaris/db";
import { ledgerEventSchema, ledgerJobKind, type LedgerEvent } from "@tonaris/domain";

import type { JobHandler } from "./worker";

/** A queued event the schema refuses: no retry can mend it. */
class InvalidLedgerEvent extends Error {}

export function ledgerJob(store: LedgerStore): JobHandler {
  return {
    kind: ledgerJobKind,
    run: async (job) => {
      const event = ledgerEventSchema.safeParse(job.payload);
      if (!event.success) throw new InvalidLedgerEvent(event.error.message);
      await store.append(event.data);
    },
    retryable: (error) => !(error instanceof InvalidLedgerEvent),
    retriesForever: true,
    // Only an invalid event ends here; its row keeps it for the record.
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
