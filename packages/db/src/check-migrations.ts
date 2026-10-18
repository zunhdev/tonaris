// Checks that the committed migrations match the schema (TS-17, TS-124). Run with `bun run db:check`.
// - `drizzle-kit check`: every snapshot is readable and current, and no two migrations conflict.
// - `drizzle-kit generate --explain`: the schema has no change that lacks a migration. It writes nothing.
// Neither needs a database.

import path from "node:path";

import { $ } from "bun";

const packageDir = path.join(import.meta.dir, "..");
const drizzleKit = [process.execPath, "--bun", "drizzle-kit"];

type ExplainResult = { status: string; statements?: unknown };

/** The JSON report `generate --explain --output json` prints as its last line, if it printed one. */
function parseExplain(stdout: string): ExplainResult | undefined {
  const lastLine = stdout.trim().split("\n").at(-1) ?? "";
  let value: unknown;
  try {
    value = JSON.parse(lastLine);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || !("status" in value)) return undefined;
  const { status } = value;
  if (typeof status !== "string") return undefined;
  return { status, statements: "statements" in value ? value.statements : undefined };
}

export async function checkMigrations(): Promise<string[]> {
  const problems: string[] = [];

  const check = await $`${drizzleKit} check`.cwd(packageDir).nothrow().quiet();
  if (check.exitCode !== 0) {
    problems.push(
      `drizzle-kit check failed:\n${check.stdout.toString()}${check.stderr.toString()}`.trim(),
    );
  }

  const explain = await $`${drizzleKit} generate --explain --output json`
    .cwd(packageDir)
    .nothrow()
    .quiet();
  const result = parseExplain(explain.stdout.toString());
  if (!result) {
    problems.push(
      `drizzle-kit generate --explain failed:\n${explain.stdout.toString()}${explain.stderr.toString()}`.trim(),
    );
  }
  if (result && result.status !== "no_changes") {
    problems.push(
      `The schema has changes without a migration (status "${result.status}"). Run \`bun run db:generate\`, review the SQL and commit it.\n${JSON.stringify(result.statements ?? [], null, 2)}`,
    );
  }
  return problems;
}

if (import.meta.main) {
  const problems = await checkMigrations();
  if (problems.length > 0) {
    console.error(
      `Migration check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("Migrations match the schema.");
}
