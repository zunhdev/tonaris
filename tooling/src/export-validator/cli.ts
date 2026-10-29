// Validates a Tonaris export archive (AC-41, TS-121), or with `--seeded` the seeded one CI checks. Exits 1 when the
// archive has a problem, listing each.
//
//   bun tooling/src/export-validator/cli.ts tonaris-export-20261029-1200.zip
//   bun tooling/src/export-validator/cli.ts --seeded

import { seededArchive } from "./seeded";
import { validateArchive } from "./validate";

const argument = process.argv[2];
if (argument === undefined) {
  console.error("Usage: bun tooling/src/export-validator/cli.ts <archive.zip> | --seeded");
  process.exit(2);
}
const seeded = argument === "--seeded";
const archive = seeded ? seededArchive() : new Uint8Array(await Bun.file(argument).arrayBuffer());
const problems = validateArchive(archive);
const name = seeded ? "The seeded export" : argument;
if (problems.length === 0) {
  console.log(`${name} is a valid Tonaris export.`);
} else {
  console.error(
    `${name} has ${problems.length} ${problems.length === 1 ? "problem" : "problems"}:`,
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
