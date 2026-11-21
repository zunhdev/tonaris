// Seeds the demo collection (TON-308) into a database: `bun run seed:demo` for the local one, and the pictures run's
// API (apps/api/src/pictures-server.ts) for its own. Every run replaces the demo accounts' data in one transaction,
// so it is safe to repeat and never touches anyone else's.

import {
  accountSync,
  albumFieldMulti,
  albumFieldValues,
  albums,
  albumServiceLinks,
  closeDatabase,
  containers,
  createDatabase,
  type Database,
  databaseUrl,
  fieldDefinitions,
  fieldOptions,
  memberships,
  profileFavorites,
  redact,
  savedReferences,
  shareGrants,
  shareLinks,
  users,
  viewPrefs,
} from "@tonaris/db";

import { insert, removeAccounts } from "../workload/seed";
import { type Demo, generateDemo } from "./collection";

/** Replaces the demo accounts' data with `demo`. */
export async function seedDemo(db: Database, demo: Demo = generateDemo()): Promise<void> {
  const { rows } = demo;
  await db.transaction(async (tx) => {
    await removeAccounts(tx, demo.accounts);
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
    await insert(tx, profileFavorites, rows.profileFavorites);
    await insert(tx, viewPrefs, rows.viewPrefs);
  });
}

if (import.meta.main) {
  if (process.env.NODE_ENV === "production") {
    console.error("The demo collection is test data; it is never seeded with NODE_ENV=production.");
    process.exit(1);
  }
  const url = databaseUrl();
  const db = createDatabase(url, { max: 1 });
  try {
    const demo = generateDemo();
    await seedDemo(db, demo);
    const owned = demo.rows.albums.filter((album) => album.ownerId === demo.owner.id).length;
    console.log(
      `Seeded the demo collection into ${redact(url)}: ${demo.owner.email} owns ${owned} albums.\n` +
        `Sign in as ${demo.accounts.map((account) => account.email).join(", ")}; the code arrives in Mailpit.\n` +
        `Late night's guest page: /s/${demo.linkToken}`,
    );
    // The pictures run's API (apps/api/src/pictures-server.ts) reads the link's token from here.
    const infoFile = process.env.DEMO_INFO_FILE;
    if (infoFile) await Bun.write(infoFile, JSON.stringify({ linkToken: demo.linkToken }));
  } finally {
    await closeDatabase(db);
  }
}
