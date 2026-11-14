// Checks the workspace's direct dependencies against the security advisories their own GitHub repositories
// publish (TS-07; the update-packages skill). `bun audit` reads GitHub's reviewed advisory database, which some
// projects reach late or never: Better Auth's 3 November 2026 advisories were only on its own repository, so
// neither `bun audit` nor Dependabot reported them. This asks each dependency's repository directly.
// Run with `bun run deps:advisories` (`--json` for machine output). It needs `gh` signed in, or GITHUB_TOKEN.

import path from "node:path";

import { $ } from "bun";
import { z } from "zod";

import { loadWorkspace, type PackageJson } from "../workspace-check";

/** The fields read from GitHub's repository advisories API; anything else in an answer is ignored. */
const advisoriesSchema = z.array(
  z.object({
    ghsa_id: z.string(),
    severity: z.string().nullable(),
    summary: z.string(),
    html_url: z.string(),
    published_at: z.string(),
    withdrawn_at: z.string().nullable(),
    vulnerabilities: z
      .array(
        z.object({
          package: z.object({ ecosystem: z.string(), name: z.string().nullable() }).nullable(),
          vulnerable_version_range: z.string().nullable(),
          patched_versions: z.string().nullable(),
        }),
      )
      .nullable(),
  }),
);

export type Advisory = z.infer<typeof advisoriesSchema>[number];

export type Hit = {
  dependency: string;
  version: string;
  advisory: string;
  severity: string;
  patched: string;
  summary: string;
  url: string;
};

const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies"] as const;

/** Every external dependency with the exact versions the workspace pins (TS-07). */
export function directDependencies(manifests: PackageJson[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    for (const field of dependencyFields) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (version.startsWith("workspace:")) continue;
        deps.set(name, (deps.get(name) ?? new Set()).add(version));
      }
    }
  }
  return deps;
}

/** `owner/repo` from a package's `repository` field, or undefined if it isn't on GitHub. */
export function githubRepository(repository: unknown): string | undefined {
  const url =
    typeof repository === "string"
      ? repository
      : typeof repository === "object" && repository !== null && "url" in repository
        ? String(repository.url)
        : "";
  const match =
    /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(url) ??
    /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?(?:[/#].*)?$/.exec(url);
  return match?.[1];
}

/** Whether a version's order against a bound meets the bound's operator. */
const holds = new Map<string, (order: number) => boolean>([
  ["<", (order) => order < 0],
  ["<=", (order) => order <= 0],
  [">", (order) => order > 0],
  [">=", (order) => order >= 0],
  ["=", (order) => order === 0],
]);

/**
 * Whether `version` is in GitHub's `vulnerable_version_range` (">= 1.0.0, < 1.7.16"). An advisory without a
 * range counts as a hit, so a person reads it.
 *
 * Each bound is compared in semver order. A range check (`satisfies`) would match a pre-release only against bounds
 * of its own release, so a release candidate such as `2.0.0-rc.4` would never be found in "< 2.0.0", the advisory
 * fixed in the final release (DRIFT-109).
 */
export function isAffected(version: string, range: string | null): boolean {
  if (!range) return true;
  return range.split(",").every((bound) => {
    const match = /^\s*(<=|>=|<|>|=)?\s*v?(\S+)\s*$/.exec(bound);
    if (!match?.[2]) return Bun.semver.satisfies(version, bound.trim());
    const order = Bun.semver.order(version, match[2]);
    return holds.get(match[1] ?? "=")?.(order) ?? false;
  });
}

export function findHits(
  dependency: string,
  versions: Iterable<string>,
  advisories: Advisory[],
): Hit[] {
  const hits: Hit[] = [];
  for (const advisory of advisories) {
    if (advisory.withdrawn_at) continue;
    for (const vulnerability of advisory.vulnerabilities ?? []) {
      if (vulnerability.package?.ecosystem !== "npm") continue;
      if (vulnerability.package.name !== dependency) continue;
      for (const version of versions) {
        if (!isAffected(version, vulnerability.vulnerable_version_range)) continue;
        hits.push({
          dependency,
          version,
          advisory: advisory.ghsa_id,
          severity: advisory.severity ?? "unknown",
          patched: vulnerability.patched_versions ?? "none yet",
          summary: advisory.summary,
          url: advisory.html_url,
        });
      }
    }
  }
  return hits;
}

async function githubToken(): Promise<string | undefined> {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  const result = await $`gh auth token`.quiet().nothrow();
  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Response> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response;
}

/** The `repository` field of the pinned version on the npm registry. */
async function npmRepository(name: string, version: string): Promise<unknown> {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
  const body: unknown = await (await fetchJson(url, {})).json();
  return typeof body === "object" && body !== null && "repository" in body
    ? body.repository
    : undefined;
}

/** Every published advisory of a repository, following the API's pages. */
async function repositoryAdvisories(repo: string, token: string | undefined): Promise<Advisory[]> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const advisories: Advisory[] = [];
  let url: string | undefined =
    `https://api.github.com/repos/${repo}/security-advisories?state=published&per_page=100`;
  while (url) {
    // Each page names the next one, so they come one after another.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetchJson(url, headers);
    // oxlint-disable-next-line no-await-in-loop
    advisories.push(...advisoriesSchema.parse(await response.json()));
    url = /<([^>]+)>; rel="next"/.exec(response.headers.get("link") ?? "")?.[1];
  }
  return advisories;
}

/** Runs `work` over `items`, at most `limit` at a time. */
async function inBatches<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += limit) {
    // One batch at a time, to stay polite to the registry and GitHub's API.
    // oxlint-disable-next-line no-await-in-loop
    results.push(...(await Promise.all(items.slice(start, start + limit).map(work))));
  }
  return results;
}

export async function checkAdvisories(rootDir: string) {
  const { root, packages } = await loadWorkspace(rootDir);
  const deps = directDependencies([root, ...packages.map((pkg) => pkg.manifest)]);
  const token = await githubToken();

  const located = await inBatches([...deps], 8, async ([name, versions]) => {
    const version = [...versions][0] ?? "";
    try {
      return { name, versions, repo: githubRepository(await npmRepository(name, version)) };
    } catch (error) {
      return { name, versions, repo: undefined, error: String(error) };
    }
  });

  const byRepo = new Map<string, typeof located>();
  const unchecked: string[] = [];
  for (const dep of located) {
    if (!dep.repo) unchecked.push(dep.error ? `${dep.name} (${dep.error})` : dep.name);
    else byRepo.set(dep.repo, [...(byRepo.get(dep.repo) ?? []), dep]);
  }

  const hits: Hit[] = [];
  await inBatches([...byRepo], 4, async ([repo, repoDeps]) => {
    try {
      const advisories = await repositoryAdvisories(repo, token);
      for (const dep of repoDeps) hits.push(...findHits(dep.name, dep.versions, advisories));
    } catch (error) {
      unchecked.push(...repoDeps.map((dep) => `${dep.name} (${repo}: ${String(error)})`));
    }
  });

  hits.sort(
    (a, b) => a.dependency.localeCompare(b.dependency) || a.advisory.localeCompare(b.advisory),
  );
  return { checked: deps.size - unchecked.length, repositories: byRepo.size, hits, unchecked };
}

if (import.meta.main) {
  const result = await checkAdvisories(path.resolve(import.meta.dir, "../../.."));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const hit of result.hits) {
      console.log(
        `${hit.severity.padEnd(8)} ${hit.dependency}@${hit.version}  ${hit.advisory}  fixed in ${hit.patched}\n         ${hit.summary}\n         ${hit.url}`,
      );
    }
    console.log(
      `\n${result.hits.length} advisories affect the pinned versions; ${result.checked} dependencies checked across ${result.repositories} repositories.`,
    );
    if (result.unchecked.length > 0) {
      console.log(
        `Not checked (no GitHub repository or the request failed):\n- ${result.unchecked.join("\n- ")}`,
      );
    }
  }
  if (result.hits.length > 0) process.exit(1);
}
