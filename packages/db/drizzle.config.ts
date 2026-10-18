// drizzle-kit configuration (TS-17): migrations are generated from the schema, reviewed and committed.
// `generate` and `check` work offline; `db:migrate` applies the migrations through src/migrate.ts.

import { defineConfig } from "drizzle-kit";

import { databaseUrl } from "./src/config";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: databaseUrl() },
});
