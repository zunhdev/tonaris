// The mechanical half of the drift audit (the audit-drift skill): references that no longer point anywhere.
// - Rule IDs (TS-, FR-, DS-, Q-, AC-, X-) cited in code, docs, OpenSpec specs or skills that no document defines.
// - Repository paths named in docs, OpenSpec specs, skills and code comments that no longer exist.
// - `bun run <script>` commands in the docs with no such script.
// - OpenSpec changes left unarchived (TS-132: a change is archived in its own PR).
// Run with `bun run check:refs`; `bun run check` runs it too, so these can't drift again.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { loadWorkspace, type PackageJson } from "../workspace-check";

export type Finding = { kind: "id" | "path" | "script" | "change"; where: string; detail: string };

/**
 * The documents that define rule IDs: a heading (`### FR-01 — …`), a bold `**ID Title.**` paragraph, or a
 * table row starting `| ID |`.
 */
const definingDocs = ["docs/product-requirements.md", "docs/design-spec.md", "docs/tech-spec.md"];
const idPattern = /\b(?:TS|FR|DS|Q|AC|X)-\d+(?:\.\d+)?\b/g;
const definitionPatterns = [
  /^#+ ((?:TS|FR|DS|Q|AC|X)-\d+(?:\.\d+)?)\b/,
  /^\*\*((?:TS|FR|DS|Q|AC|X)-\d+(?:\.\d+)?)\b/,
  /^\| *((?:TS|FR|DS|Q|AC|X)-\d+(?:\.\d+)?) *\|/,
];

/** Where references are looked for. Code is searched for IDs and paths; prose also for `bun run` commands. */
const codeRoots = ["apps/api/src", "apps/web/src", "apps/web/e2e", "packages", "tooling/src"];
const proseFiles = [
  "README.md",
  "docs/*.md",
  "docs/runbooks/*.md",
  "openspec/specs/*/spec.md",
  ".claude/skills/*.md",
  ".claude/skills/*/*.md",
];
/** Files written by tools rather than people: OpenSpec's generated skills. */
const generatedProse = /^\.claude\/skills\/openspec-/;
const pathPrefixes = [
  "apps/",
  "packages/",
  "tooling/",
  "docs/",
  "openspec/",
  ".github/",
  ".claude/",
];

/** IDs a document defines, plus the ones it retired: IDs are never reused, so a retired one stays known. */
export function definedIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const line of markdown.split("\n")) {
    for (const pattern of definitionPatterns) {
      const id = pattern.exec(line)?.[1];
      if (id) ids.add(id);
    }
    for (const match of line.matchAll(/\bretired ((?:TS|FR|DS|Q|AC|X)-\d+(?:\.\d+)?)\b/gi)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return ids;
}

/**
 * A backticked token that names a repository file or folder, or undefined. Placeholders (`<name>`, `{id}`,
 * `…`), globs and examples with spaces are skipped; a trailing `:line` or `#anchor` is dropped.
 */
export function repositoryPath(token: string): string | undefined {
  if (!pathPrefixes.some((prefix) => token.startsWith(prefix))) return undefined;
  if (/[\s<>{}*…|]|\.\.\./.test(token)) return undefined;
  return token.replace(/(?::\d+(?:-\d+)?|#[\w-]+)$/, "").replace(/\/$/, "");
}

/**
 * `bun run` commands in prose: the script and the folder it runs in, from `--cwd`. Without `--cwd` the folder
 * is often given in the prose ("In `apps/web`: …"), so `cwd` is undefined and any package's script counts.
 */
export function bunRunCommands(text: string): { script: string; cwd: string | undefined }[] {
  const commands: { script: string; cwd: string | undefined }[] = [];
  for (const match of text.matchAll(/\bbun run(?: --cwd ([\w./-]+))? ([\w:-]+)/g)) {
    const [, cwd, script] = match;
    if (script) commands.push({ script, cwd });
  }
  return commands;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

async function readText(rootDir: string, file: string): Promise<string> {
  return Bun.file(path.join(rootDir, file)).text();
}

async function listFiles(rootDir: string, patterns: string[]): Promise<string[]> {
  const files = await Promise.all(
    patterns.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: rootDir }))),
  );
  return [...new Set(files.flat())].toSorted();
}

async function codeFiles(rootDir: string): Promise<string[]> {
  const files = await listFiles(
    rootDir,
    codeRoots.map((root) => `${root}/**/*.{ts,tsx,css}`),
  );
  // Generated files and the finished spikes' copies (bunfig.toml) aren't maintained by hand.
  return files.filter(
    (file) =>
      !file.includes("/node_modules/") &&
      !file.endsWith(".gen.ts") &&
      !file.startsWith("tooling/src/spikes/"),
  );
}

export async function checkReferences(rootDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const defined = new Set<string>();
  for (const doc of await Promise.all(definingDocs.map((file) => readText(rootDir, file)))) {
    for (const id of definedIds(doc)) defined.add(id);
  }

  const prose = (await listFiles(rootDir, proseFiles)).filter((file) => !generatedProse.test(file));
  const sources = [...prose, ...(await codeFiles(rootDir))];
  const { root, packages } = await loadWorkspace(rootDir);
  const scripts = new Map<string, PackageJson["scripts"]>([[".", root.scripts]]);
  for (const pkg of packages) scripts.set(path.relative(rootDir, pkg.dir), pkg.manifest.scripts);

  const texts = await Promise.all(
    sources.map(async (file) => ({ file, text: await readText(rootDir, file) })),
  );
  for (const { file, text } of texts) {
    const isProse = file.endsWith(".md");

    for (const match of text.matchAll(idPattern)) {
      if (!defined.has(match[0])) {
        findings.push({
          kind: "id",
          where: `${file}:${lineOf(text, match.index)}`,
          detail: `${match[0]} is defined in no document`,
        });
      }
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const target = repositoryPath(match[1] ?? "");
      if (target && !existsSync(path.join(rootDir, target))) {
        findings.push({
          kind: "path",
          where: `${file}:${lineOf(text, match.index)}`,
          detail: `${target} does not exist`,
        });
      }
    }

    if (!isProse) continue;
    for (const { script, cwd } of bunRunCommands(text)) {
      const candidates =
        cwd === undefined ? [...scripts.values()] : [scripts.get(path.normalize(cwd))];
      if (!candidates.some((known) => known && script in known)) {
        findings.push({
          kind: "script",
          where: file,
          detail: `bun run ${cwd === undefined ? "" : `--cwd ${cwd} `}${script}: no such script`,
        });
      }
    }
  }

  const changes = path.join(rootDir, "openspec/changes");
  for (const entry of readdirSync(changes, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "archive") {
      findings.push({
        kind: "change",
        where: `openspec/changes/${entry.name}`,
        detail: "OpenSpec change not archived (TS-132)",
      });
    }
  }
  return findings;
}

if (import.meta.main) {
  const findings = await checkReferences(path.resolve(import.meta.dir, "../../.."));
  if (findings.length > 0) {
    console.error(
      `Drift references check failed:\n${findings
        .map((finding) => `- [${finding.kind}] ${finding.where}: ${finding.detail}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
  console.log("Drift references check passed.");
}
