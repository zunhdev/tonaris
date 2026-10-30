# Tonaris — restoring a backup

For a lost or damaged database (Q-04, TS-112, TS-113). **Objectives** are the creator's: set on 30 October 2026, revised the same day for Render (TON-108):
- continuous backups: Render Postgres's point-in-time recovery, to any moment of the last 3 days on Render's Hobby plan, 7 on Pro;
- at most a few minutes of changes lost;
- the service back within 24 hours;
- a drill every 3 months.

## What keeps the backups

- **Render** backs up `tonaris-db` continuously. A restore never overwrites it: it creates a new database as it was at the moment you pick, and you then point the API at that one. Nothing in Tonaris schedules or records backups. Render's dashboard shows them, on the database's **Recovery** page.
- **The revocation ledger** (`LEDGER_URL`, the R2 bucket `tonaris-ledger`) holds every deletion-class event since, written by the API as it happens. A restored database predates them, so the reconciliation below replays them. A restore needs the ledger as much as the backup. Its bucket is outside Render and write-once for 30 days.

## Restoring

1. **Pick the moment** to go back to: just before the damage. Write it down in UTC, such as `2026-11-02T14:30:00Z`. Render can't restore to the last 10 minutes.
2. **Keep everyone out.** In Render, open `tonaris-web`, then `tonaris-api` → **Settings** → **Maintenance Mode**, and turn it on. Visitors, guests and MCP clients get a 503. The services keep running, reachable over the private network and through their Shell.
3. **Restore.** Open `tonaris-db` → **Recovery** → **Point-in-Time Recovery** → **Restore Database**:
   - **Name:** `tonaris-db-` and the date, such as `tonaris-db-20261102`.
   - **The moment** from step 1. Check which time zone the form shows.
   - **Copy Existing Settings:** **Yes**, then **Start Recovery**.

   Wait until the new database is **Available**.
4. **Reconcile it.**
   - Open the new database → **Connect** → **Internal**, and copy its **Internal Database URL**.
   - Open `tonaris-api` → **Shell**, and run:

     ```sh
     bun /app/bin/reconcile.js --into "<the internal URL>" --restored-to 2026-11-02T14:30:00Z
     ```

   The Shell already has `LEDGER_URL` and the R2 key. What the command does:
   - It replays the ledger's events from 10 minutes before that moment: deleted accounts, revoked connections, links and grants, purged Trash units and revoked admissions.
   - It runs the Trash-expiry sweep.
   - It ends every session and MCP token, so people sign in again and AI clients reconnect.
   - It prints what it did, and the accounts and albums the database holds.
   - It refuses the live database's URL.
5. **Secrets:** keep `BETTER_AUTH_SECRET` unless it may have leaked. Every share link's address is derived from it, so a new one changes every link people have shared. The reconciliation already ended what rotating it would end.
6. **Point the API at it** through `render.yaml`. Edit the file in a pull request and merge it:
   - Rename the database entry from `tonaris-db` to the new name.
   - Rename `DATABASE_URL`'s `fromDatabase` reference to match.

   The Blueprint adopts the restored database and redeploys both services, API first. A dashboard edit of `DATABASE_URL` alone would be undone by the next Blueprint sync.
7. **Reopen and smoke-test:**
   - Turn **Maintenance Mode** off, on `tonaris-api` first, then on `tonaris-web`.
   - Check `https://api.tonaris.app/v1/health`.
   - Sign in with an email code.
   - Open one owner's collection.
   - Open a guest link that should work, and one revoked since the restore point, which must say it's no longer available.
8. **Afterwards:** once the service has run well for a few days, delete the old database (its **Settings** → **Delete Database**). The Blueprint no longer manages it, and it costs until deleted. The new database's own recovery window starts when it was created.

## Drills

Every 3 months, into a scratch database, without touching the live one:

1. **Set up an event to replay.** In Tonaris, create a share link. At least 15 minutes later, revoke it, and note a moment in between, in UTC.
2. **Restore** `tonaris-db` to that moment, as in step 3, named `tonaris-drill-` and the date.
3. **Reconcile** it from `tonaris-api`'s Shell, as in step 4, with the drill database's internal URL. The output must count at least one `shareLink.revoked`, and accounts and albums close to the live service's.
4. **Delete** the drill database: its **Settings** → **Delete Database**.
5. **Add a row below.**

| Date | Backup | Restore (wall time) | Replayed | Checked | Result |
| --- | --- | --- | --- | --- | --- |
| 30 Oct 2026 (TON-96) | Local dev database with the 5,000-album workload, through the former `pg_dump` tooling: 2.5 MB encrypted, 0.2 s | 0.4 s into a fresh `tonaris_drill` | 4 events: 2 link revocations, 2 Trash purges | A link live in the backup and revoked after it stayed revoked. An album purged after the backup, and both Trash units, stayed gone. Album and live-link counts matched the live database. | Passed |
