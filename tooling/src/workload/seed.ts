// Seeds the reference workload (TS-120) into a database. `bun run seed:workload` seeds the local one (TS-06).
// The workload lives in accounts of its own, workload@tonaris.test and three sharers. Every run replaces their
// data in one transaction, so it is safe to repeat and never touches anyone else's.

import { type InferInsertModel, inArray, or } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";

import {
  accountSync,
  albumFieldMulti,
  albumFieldValues,
  albums,
  albumServiceLinks,
  changeLog,
  containers,
  createDatabase,
  type Database,
  databaseUrl,
  fieldDefinitions,
  fieldOptions,
  memberships,
  mutations,
  positions,
  redact,
  savedReferences,
  shareGrants,
  shareLinks,
  trashUnits,
  users,
  viewPrefs,
} from "@tonaris/db";

import { type Account, generateWorkload, type Workload } from "./generate";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Rows per INSERT, well under Postgres's limit of 65,535 bind parameters per statement. */
const batchSize = 1_000;

async function insert<T extends PgTable>(
  tx: Transaction,
  table: T,
  rows: readonly InferInsertModel<T>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    // A transaction runs one statement at a time.
    // oxlint-disable-next-line no-await-in-loop
    await tx.insert(table).values(rows.slice(i, i + batchSize) as PgInsertValue<T>[]);
  }
}

/** Replaces the workload accounts' data with `workload`. */
export async function seedWorkload(
  db: Database,
  workload: Workload = generateWorkload(),
): Promise<void> {
  const { rows } = workload;
  await db.transaction(async (tx) => {
    await removeAccounts(tx, workload.accounts);
    await insert(tx, users, rows.users);
    await insert(tx, accountSync, rows.accountSync);
    await insert(tx, fieldDefinitions, rows.fieldDefinitions);
    await insert(tx, fieldOptions, rows.fieldOptions);
    await insert(tx, containers, rows.containers);
    await insert(tx, albums, rows.albums);
    await insert(tx, albumServiceLinks, rows.albumServiceLinks);
    await insert(tx, memberships, rows.memberships);
    await insert(tx, albumFieldValues, rows.albumFieldValues);
    await insert(tx, albumFieldMulti, rows.albumFieldMulti);
    await insert(tx, shareLinks, rows.shareLinks);
    await insert(tx, shareGrants, rows.shareGrants);
    await insert(tx, savedReferences, rows.savedReferences);
  });
}

/**
 * Deletes the accounts, matched by id or email, with everything they own or saved. Owner columns don't cascade
 * from `user` (TS-74), so the owned rows go first; deleting containers and albums cascades to what hangs off them.
 */
async function removeAccounts(tx: Transaction, accounts: readonly Account[]): Promise<void> {
  const found = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      or(
        inArray(
          users.id,
          accounts.map((account) => account.id),
        ),
        inArray(
          users.email,
          accounts.map((account) => account.email),
        ),
      ),
    );
  const ids = found.map((user) => user.id);
  if (ids.length === 0) return;

  await tx.delete(savedReferences).where(inArray(savedReferences.viewerId, ids));
  await tx.delete(shareGrants).where(inArray(shareGrants.granteeId, ids));
  await tx.delete(containers).where(inArray(containers.ownerId, ids));
  await tx.delete(albums).where(inArray(albums.ownerId, ids));
  await tx.delete(fieldDefinitions).where(inArray(fieldDefinitions.ownerId, ids));
  await tx.delete(trashUnits).where(inArray(trashUnits.ownerId, ids));
  await tx.delete(positions).where(inArray(positions.personId, ids));
  await tx.delete(viewPrefs).where(inArray(viewPrefs.personId, ids));
  await tx.delete(changeLog).where(inArray(changeLog.accountId, ids));
  await tx.delete(mutations).where(inArray(mutations.accountId, ids));
  await tx.delete(accountSync).where(inArray(accountSync.accountId, ids));
  // Sessions and linked sign-in methods cascade.
  await tx.delete(users).where(inArray(users.id, ids));
}

const count = (n: number) => n.toLocaleString("en-US");

/** What was seeded, and how to use it. */
export function describeWorkload(workload: Workload): string {
  const { owner, shares, rows } = workload;
  const owned = <T extends { ownerId: string }>(items: readonly T[]) =>
    items.filter((item) => item.ownerId === owner.id);
  const ownedContainers = owned(rows.containers);
  const ownedAlbums = owned(rows.albums);
  const ownedMemberships = owned(rows.memberships);
  const albumIds = new Set(ownedAlbums.map((album) => album.id));
  const inLists = new Set(ownedMemberships.map((membership) => membership.albumId));
  const withFields = new Set(
    rows.albumFieldValues.filter((value) => albumIds.has(value.albumId)).map((v) => v.albumId),
  );
  const kinds = (kind: string) => ownedContainers.filter((c) => c.kind === kind).length;

  return [
    `${owner.email} owns ${count(ownedAlbums.length)} albums in ${count(kinds("list"))} lists and ` +
      `${count(kinds("folder"))} folders: ${count(ownedMemberships.length)} list entries, ` +
      `${count(albumIds.size - inLists.size)} albums in Unsorted, and ` +
      `${owned(rows.fieldDefinitions).length} custom fields applied to ${count(withFields.size)} albums.`,
    `Shared with ${owner.email}:`,
    ...shares.map(
      (s) =>
        `  ${s.name} (${s.kind}, ${count(s.albums)} albums) from ${s.owner.displayName}, ` +
        (s.token ? `through a saved link; token ${s.token}` : "through an accepted invitation"),
    ),
    `Sign in as ${owner.email} or a sharer (${shares.map((s) => s.owner.email).join(", ")}); ` +
      "the code arrives in Mailpit.",
  ].join("\n");
}

if (import.meta.main) {
  if (process.env.NODE_ENV === "production") {
    console.error("The workload is test data; it is never seeded with NODE_ENV=production.");
    process.exit(1);
  }
  const url = databaseUrl();
  const db = createDatabase(url, { max: 1 });
  try {
    const started = performance.now();
    const workload = generateWorkload();
    await seedWorkload(db, workload);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`Seeded the TS-120 reference workload into ${redact(url)} in ${seconds} s.\n`);
    console.log(describeWorkload(workload));
  } finally {
    await db.$client.end();
  }
}
