// Operator backups (TS-112, Q-04): each successful run of `tooling/backup`, for the admin view's "age of the last
// backup" (TS-115). The backups themselves are encrypted and off-site; only their names and sizes are here.

import { bigint, text, uuid } from "drizzle-orm/pg-core";

import { instant, table } from "./columns";

export const backupRuns = table("backup_runs", {
  id: uuid().primaryKey(),
  /** When the upload finished: the backup holds the database as of shortly before. */
  finishedAt: instant().notNull(),
  /** The encrypted dump's name where it was stored, such as `tonaris-20261030T040000Z.dump.age`. */
  objectKey: text().notNull(),
  bytes: bigint({ mode: "number" }).notNull(),
});
