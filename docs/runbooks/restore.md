# Tonaris — restoring a backup

For a lost or damaged database (Q-04, TS-112, TS-113). **Objectives** (the creator's, 30 October 2026):
- daily backups, kept 30 days;
- at most 24 hours of changes lost;
- the service back within 24 hours;
- a drill every 3 months.

## What runs every day

`tooling/src/backup/backup.ts`, on the host's scheduler, once a day:

```sh
DATABASE_URL=postgres://… \
BACKUP_URL=s3://tonaris-backups/daily \
BACKUP_RECIPIENT=age1…            # the public half of the key below
S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… S3_ENDPOINT=… S3_REGION=… \
bun tooling/src/backup/backup.ts
```

- **What it does:** `pg_dump -Fc`, encrypted with `age` to `BACKUP_RECIPIENT`, stored as `tonaris-YYYYMMDDTHHMMSSZ.dump.age`. It removes backups older than 30 days and records the run in `backup_runs`.
- **It needs:** the PG18 client tools (`pg_dump`, `pg_restore`) and `age`.
- **The key:** `age-keygen -o identity.txt` once. Keep `identity.txt` offline, in a password manager or on paper, never on the host. Only its public line goes into `BACKUP_RECIPIENT`.
- **The revocation ledger** is written by the API as changes happen, to `LEDGER_URL`: a bucket of its own, with write-once retention if the storage has it. A restore needs it as much as the backup.

## Restoring

1. **Keep everyone out.**
   - Take the service down, or leave it on the old database.
   - Restore into a new, empty database: nothing reaches it, guests and MCP included, until step 5.
2. **Restore and reconcile:**

   ```sh
   BACKUP_URL=… LEDGER_URL=… S3_…=… bun tooling/src/backup/restore.ts          # lists the backups
   BACKUP_URL=… LEDGER_URL=… S3_…=… bun tooling/src/backup/restore.ts \
     tonaris-20261030T040000Z.dump.age --into postgres://…/tonaris_restored --identity identity.txt
   ```

   It decrypts the backup and restores it. Then it replays the ledger's events from 10 minutes before the backup was taken: deleted accounts, revoked connections, links and grants, purged Trash units and revoked admissions. It runs the Trash-expiry sweep. Finally it ends every session and MCP token, so people sign in again and AI clients reconnect. It prints what it did, and the accounts and albums the database holds.
3. **Secrets:** keep `BETTER_AUTH_SECRET` unless it may have leaked. Every share link's address is derived from it, so a new one changes every link people have shared. The restore already ended what rotating it would end.
4. **Smoke-test against the new database:**
   - the API's `/healthz`;
   - signing in with an email code;
   - one owner's collection;
   - a guest link that should work, and one revoked since the backup, which must say it's no longer available.
5. **Reopen:** point the API's `DATABASE_URL` at the new database, then start the API before the web app (TS-124).

## Drills

Every 3 months: restore the latest backup into a scratch database (steps 2 and 4), and check what changed since. Add a row below.

| Date | Backup | Restore (wall time) | Replayed | Checked | Result |
| --- | --- | --- | --- | --- | --- |
| 30 Oct 2026 (TON-96) | Local dev database with the 5,000-album workload: 2.5 MB encrypted, 0.2 s | 0.4 s into a fresh `tonaris_drill` | 4 events: 2 link revocations, 2 Trash purges | A link live in the backup and revoked after it stayed revoked. An album purged after the backup, and both Trash units, stayed gone. Album and live-link counts matched the live database. | Passed |
