// The operator backup (TS-112, Q-04): `pg_dump -Fc` of the database, encrypted with `age` to an offline-held key,
// stored at BACKUP_URL, and the backups older than the retention removed. Each success is recorded in
// `backup_runs`, for the admin view (TS-115). Daily, kept 30 days (decided 30 October 2026). It runs on any
// host's scheduler or a developer machine, and needs the PG18 client tools and `age`.
//
//   DATABASE_URL=… BACKUP_URL=s3://tonaris-backups/daily BACKUP_RECIPIENT=age1… bun tooling/src/backup/backup.ts
//
// BACKUP_RETENTION_DAYS overrides the 30 days.

import { backupRuns, createDatabase, databaseUrl } from "@tonaris/db";
import { uuidv7 } from "@tonaris/domain";

import { backupName, backupStorage, takenAt } from "./storage";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (see tooling/src/backup/backup.ts).`);
  return value;
};

const url = databaseUrl();
const storage = backupStorage(required("BACKUP_URL"));
const recipient = required("BACKUP_RECIPIENT");
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

const started = new Date();
const name = backupName(started);
const dump = Bun.spawn(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", url], {
  stdout: "pipe",
  stderr: "inherit",
});
const age = Bun.spawn(["age", "--encrypt", "--recipient", recipient], {
  stdin: dump.stdout,
  stdout: "pipe",
  stderr: "inherit",
});
const bytes = new Uint8Array(await new Response(age.stdout).arrayBuffer());
const [dumped, encrypted] = await Promise.all([dump.exited, age.exited]);
if (dumped !== 0 || encrypted !== 0) {
  throw new Error(
    `The backup failed: pg_dump exited ${dumped}, age ${encrypted}. Nothing was stored.`,
  );
}

await storage.put(name, bytes);
const cutoff = started.getTime() - retentionDays * 24 * 60 * 60_000;
const expired = (await storage.list()).filter(
  (each) => (takenAt(each)?.getTime() ?? Infinity) < cutoff,
);
for (const each of expired) {
  // oxlint-disable-next-line no-await-in-loop -- one removal at a time
  await storage.remove(each);
}

const db = createDatabase(url, { max: 1 });
try {
  await db.insert(backupRuns).values({
    id: uuidv7(),
    finishedAt: new Date(),
    objectKey: name,
    bytes: bytes.length,
  });
} finally {
  await db.$client.end();
}
const seconds = ((Date.now() - started.getTime()) / 1000).toFixed(1);
console.log(
  `Stored ${name}: ${(bytes.length / 1_048_576).toFixed(1)} MB in ${seconds} s. Removed ${expired.length} older than ${retentionDays} days.`,
);
