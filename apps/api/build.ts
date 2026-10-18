// Bundles the API for production (TS-110): the server, the pre-deploy migration and the creator seed, each one
// file that needs no node_modules, plus the migrations they apply. `bun run build` writes:
//   dist/bin/server.js        `bun bin/server.js`, the service
//   dist/bin/migrate.js       `bun bin/migrate.js`, the pre-deploy step (TS-17)
//   dist/bin/seed-creator.js  `bun bin/seed-creator.js`, the creator bootstrap (TS-71)
//   dist/migrations/          beside bin/, where the migration library looks for it
// The API image copies dist/ as it is (apps/api/Dockerfile).

import { cp, rm } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const dist = path.join(import.meta.dir, "dist");

const entries = {
  server: "apps/api/src/index.ts",
  migrate: "packages/db/src/migrate.ts",
  "seed-creator": "apps/api/src/auth/seed-creator.ts",
};

/**
 * Script guards (`if (import.meta.main)`) are true for every module in a bundle. One inside a library module
 * would run that script whenever the bundle starts, so only an entry may have one, and the server none.
 */
function checkScriptGuards(name: string, code: string): void {
  const guards = code.split("import.meta.main").length - 1;
  const allowed = name === "server" ? 0 : 1;
  if (guards > allowed) {
    throw new Error(
      `bin/${name}.js contains ${guards} \`import.meta.main\` guard(s), at most ${allowed} allowed: a bundled library module has a script block. Move it into an entry file that nothing imports.`,
    );
  }
}

await rm(dist, { recursive: true, force: true });

async function bundle(name: string, entry: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [path.join(root, entry)],
    target: "bun",
    outdir: path.join(dist, "bin"),
    naming: `${name}.js`,
    sourcemap: "linked",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Bundling ${entry} failed.`);
  }
  const output = result.outputs.find((artifact) => artifact.kind === "entry-point");
  if (!output) throw new Error(`Bundling ${entry} produced no entry point.`);
  checkScriptGuards(name, await output.text());
}

await Promise.all(Object.entries(entries).map(([name, entry]) => bundle(name, entry)));

await cp(path.join(root, "packages/db/migrations"), path.join(dist, "migrations"), {
  recursive: true,
});

console.log(`Bundled ${Object.keys(entries).join(", ")} into ${path.relative(root, dist)}/bin.`);
