// Reconciling a restored database (TS-113, Q-04; runbook: docs/runbooks/restore.md): `reconcileRestored` on the
// database Render restored, before anything serves it. The API image carries it as `bin/reconcile.js`, so it runs in
// the API's Render Shell, where LEDGER_URL and the S3 settings are already set; elsewhere, set them first.
//
//   bun bin/reconcile.js --into <restored database URL> --restored-to 2026-11-02T14:30:00Z
//
// The switch to the restored database and the smoke test follow by hand.

import { parseArgs } from "node:util";

import { createDatabase, ledgerStore, reconcileRestored, redact } from "@tonaris/db";

if (import.meta.main) {
  const { values } = parseArgs({
    options: { into: { type: "string" }, "restored-to": { type: "string" } },
  });
  const into = values.into;
  const restoredTo = new Date(values["restored-to"] ?? "");
  if (!into || Number.isNaN(restoredTo.getTime())) {
    throw new Error(
      "Give --into <restored database URL> and --restored-to <the moment it was restored to, such as 2026-11-02T14:30:00Z>.",
    );
  }
  if (into === process.env.DATABASE_URL) {
    throw new Error(
      "That's the live database (DATABASE_URL). Reconcile the restored one first, then point DATABASE_URL at it.",
    );
  }
  if (!process.env.LEDGER_URL) throw new Error("Set LEDGER_URL, where the API writes the ledger.");

  const started = Date.now();
  const db = createDatabase(into, { max: 2 });
  try {
    const report = await reconcileRestored(db, ledgerStore(process.env.LEDGER_URL), restoredTo);
    const replayed = Object.values(report.replayed).reduce((sum, count) => sum + count, 0);
    console.log(
      `Reconciled ${redact(into)} in ${((Date.now() - started) / 1000).toFixed(1)} s, restored to ${restoredTo.toISOString()}.`,
    );
    console.log(`- Replayed ${replayed} ledger events: ${JSON.stringify(report.replayed)}.`);
    console.log(`- The Trash-expiry sweep purged Trash in ${report.swept} accounts.`);
    console.log("- Every session and MCP token ended: people sign in again, AI clients reconnect.");
    console.log(`- It holds ${report.accounts} accounts and ${report.albums} albums.`);
    console.log(
      "Next, by hand (docs/runbooks/restore.md): point the API at it, reopen, and smoke-test.",
    );
  } finally {
    await db.$client.end();
  }
}
