// Reconciling a restored database (TS-113, Q-04; runbook: docs/runbooks/restore.md). Render restores the database to
// a moment in the past as a new instance (TS-112) that nothing serves yet. This brings it forward past what
// happened since: the revocation ledger's events from just before that moment are replayed and the Trash-expiry
// sweep runs, so a deleted account, a revoked connection, link, grant or admission, and a purged or expired Trash
// unit never come back. Then every session and MCP token in it ends, so nothing signed in before the restore still
// is: people sign in again and AI clients reconnect. `bin/reconcile.js` in the API image runs it.

import { sql } from "drizzle-orm";

import type { Database } from "./client";
import type { LedgerStore } from "./ledger";
import { replayLedger, type ReplayReport } from "./ledger-replay";
import { albums, oauthAccessTokens, oauthRefreshTokens, sessions, users } from "./schema";
import { purgeExpiredTrash } from "./sync";

/** Events this close before the restore point are replayed too: replaying is harmless, missing one isn't. */
const marginMs = 10 * 60_000;

export type ReconcileReport = {
  replayed: ReplayReport;
  /** The accounts whose expired Trash the sweep purged. */
  swept: number;
  accounts: number;
  albums: number;
};

/** Brings `db`, restored to `restoredTo`, past the ledger's later events, and ends every session and token in it. */
export async function reconcileRestored(
  db: Database,
  ledger: LedgerStore,
  restoredTo: Date,
  now: Date = new Date(),
): Promise<ReconcileReport> {
  const events = (await ledger.events()).filter(
    (event) => Date.parse(event.at) >= restoredTo.getTime() - marginMs,
  );
  const replayed = await replayLedger(db, events);
  // The Trash-expiry sweep: units past their 30 days go, as they would have.
  const swept = await purgeExpiredTrash(db, now);
  // No session or token from before survives: what the restored database held may have ended since.
  await db.transaction(async (tx) => {
    await tx.delete(sessions);
    await tx.delete(oauthAccessTokens);
    await tx.delete(oauthRefreshTokens);
  });
  const [counts] = await db.execute<{ accounts: number; albums: number }>(
    sql`select (select count(*)::int from ${users}) as accounts, (select count(*)::int from ${albums}) as albums`,
  );
  return {
    replayed,
    swept: swept.length,
    accounts: counts?.accounts ?? 0,
    albums: counts?.albums ?? 0,
  };
}
