// The pre-deploy migration command (TS-17, TS-110): `bun run db:migrate`, or `bun bin/migrate.js` in the API
// image. A script only: nothing imports it, so a bundle that includes the migration library never runs this.

import { createDatabase } from "./client";
import { databaseUrl, redact } from "./config";
import { migrateDatabase } from "./migrations";

const url = databaseUrl();
const db = createDatabase(url, { max: 1 });
try {
  await migrateDatabase(db);
  console.log(`Migrated ${redact(url)}`);
} finally {
  await db.$client.end();
}
