// Restoring a backup (TS-112, TS-113; runbook: docs/runbooks/restore.md). It decrypts the backup, restores it into
// an empty database that nothing serves yet (that is the maintenance mode: the service stays on the old database, or
// down, until it's switched over), replays the revocation ledger's events from just before the backup, and runs the
// Trash-expiry sweep. A deleted account, a revoked connection, link, grant or admission, and a purged or expired
// Trash unit never come back. Then it ends every session and MCP token in the restored database, so nothing signed in
// before the restore still is: people sign in again and AI clients reconnect. The secret stays, since every share
// link's address is derived from it. The smoke test and reopening follow by hand.
//
//   BACKUP_URL=… LEDGER_URL=… bun tooling/src/backup/restore.ts <backup name> --into <empty database URL> \
//     --identity <age identity file>
//
// Without a backup name it lists the backups.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { sql } from "drizzle-orm";

import {
  albums,
  createDatabase,
  ledgerStore,
  oauthAccessTokens,
  oauthRefreshTokens,
  purgeExpiredTrash,
  redact,
  replayLedger,
  sessions,
  users,
} from "@tonaris/db";

import { backupStorage, takenAt } from "./storage";

/** Events this close before the backup was taken are replayed too: replaying is harmless, missing one isn't. */
const marginMs = 10 * 60_000;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (see tooling/src/backup/restore.ts).`);
  return value;
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { into: { type: "string" }, identity: { type: "string" } },
});
const storage = backupStorage(required("BACKUP_URL"));
const name = positionals[0];
if (!name) {
  console.log((await storage.list()).join("\n") || "No backups.");
  process.exit(0);
}
if (!values.into || !values.identity)
  throw new Error("Give --into <database URL> and --identity <file>.");
const taken = takenAt(name);
if (!taken) throw new Error(`${name} isn't a backup's name.`);
const started = Date.now();

// 1. Decrypt it, and restore it into a database with nothing in it.
const target = createDatabase(values.into, { max: 2 });
const scratch = await mkdtemp(path.join(tmpdir(), "tonaris-restore-"));
try {
  const [tables] = await target.execute<{ count: number }>(
    sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
  );
  if ((tables?.count ?? 0) > 0) {
    throw new Error(`${redact(values.into)} isn't empty: restore into a new database.`);
  }
  const encrypted = path.join(scratch, name);
  const dump = path.join(scratch, "tonaris.dump");
  await writeFile(encrypted, await storage.get(name));
  const age = Bun.spawn(
    ["age", "--decrypt", "--identity", values.identity, "--output", dump, encrypted],
    {
      stderr: "inherit",
    },
  );
  if ((await age.exited) !== 0) throw new Error("age couldn't decrypt the backup.");
  const restore = Bun.spawn(
    [
      "pg_restore",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      values.into,
      dump,
    ],
    { stderr: "inherit" },
  );
  if ((await restore.exited) !== 0) throw new Error("pg_restore failed.");

  // 2. Replay what the ledger recorded after it.
  const events = (await ledgerStore(required("LEDGER_URL")).events()).filter(
    (event) => Date.parse(event.at) >= taken.getTime() - marginMs,
  );
  const replayed = await replayLedger(target, events);

  // 3. The Trash-expiry sweep: units past their 30 days go, as they would have.
  const swept = await purgeExpiredTrash(target, new Date());

  // 4. No session or token from before survives: what the backup held may have ended since.
  await target.transaction(async (tx) => {
    await tx.delete(sessions);
    await tx.delete(oauthAccessTokens);
    await tx.delete(oauthRefreshTokens);
  });

  const [counts] = await target.execute<{ accounts: number; albums: number }>(
    sql`select (select count(*)::int from ${users}) as accounts, (select count(*)::int from ${albums}) as albums`,
  );
  console.log(
    `Restored ${name} into ${redact(values.into)} in ${((Date.now() - started) / 1000).toFixed(1)} s.`,
  );
  console.log(`- The backup was taken at ${taken.toISOString()}.`);
  console.log(`- Replayed ${events.length} ledger events: ${JSON.stringify(replayed)}.`);
  console.log(`- The Trash-expiry sweep purged Trash in ${swept.length} accounts.`);
  console.log("- Every session and MCP token ended: people sign in again, AI clients reconnect.");
  console.log(`- It holds ${counts?.accounts ?? 0} accounts and ${counts?.albums ?? 0} albums.`);
  console.log(
    "Next, by hand (docs/runbooks/restore.md): smoke-test, point DATABASE_URL here, reopen.",
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
  await target.$client.end();
}
