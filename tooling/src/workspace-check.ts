// Checks the Bun workspace against the repository rules in the tech spec:
// - TS-02/TS-05 layering: a workspace package may depend only on the internal packages listed below.
// - TS-07 pinning: every external dependency uses an exact version, and Bun itself is pinned.
// Run with `bun run check:workspace`; the test suite runs it as well.

import path from "node:path";

export type PackageJson = {
  name?: string;
  private?: boolean;
  type?: string;
  packageManager?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export type WorkspacePackage = { dir: string; manifest: PackageJson };

/** Internal packages each workspace package may depend on (TS-02, TS-05). */
export const allowedInternalDependencies: Readonly<Record<string, readonly string[]>> = {
  "@tonaris/domain": [],
  "@tonaris/db": ["@tonaris/domain"],
  "@tonaris/providers": ["@tonaris/domain"],
  "@tonaris/ui": [],
  "@tonaris/api": ["@tonaris/domain", "@tonaris/db", "@tonaris/providers"],
  // Only `@tonaris/providers/links`, the pure link parser (TS-40); oxlint rejects the package's root.
  "@tonaris/web": ["@tonaris/domain", "@tonaris/ui", "@tonaris/providers"],
  "@tonaris/tooling": ["@tonaris/domain", "@tonaris/db", "@tonaris/providers"],
};

/**
 * Internal packages a workspace package may use for types only, so only as a devDependency. The web app types
 * its Eden client from the API's `type App` without bundling server code (TS-29); oxlint rejects value imports.
 */
export const typeOnlyInternalDependencies: Readonly<Record<string, readonly string[]>> = {
  "@tonaris/web": ["@tonaris/api"],
};

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const internalScope = "@tonaris/";
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function internalDependencies(manifest: PackageJson): string[] {
  return dependencyFields
    .flatMap((field) => Object.keys(manifest[field] ?? {}))
    .filter((name) => name.startsWith(internalScope));
}

function checkExternalVersions(owner: string, manifest: PackageJson): string[] {
  const problems: string[] = [];
  for (const field of dependencyFields) {
    for (const [dependency, version] of Object.entries(manifest[field] ?? {})) {
      if (!dependency.startsWith(internalScope) && !exactVersion.test(version)) {
        problems.push(
          `${owner}: ${dependency} must be pinned to an exact version, found "${version}" (TS-07)`,
        );
      }
    }
  }
  return problems;
}

export function checkRoot(manifest: PackageJson, bunVersion: string): string[] {
  const problems = checkExternalVersions("root", manifest);
  const expected = `bun@${bunVersion.trim()}`;
  if (manifest.packageManager !== expected) {
    problems.push(
      `root: packageManager must be "${expected}" to match .bun-version, found "${manifest.packageManager}"`,
    );
  }
  if (internalDependencies(manifest).length > 0) {
    problems.push("root: must not depend on workspace packages");
  }
  return problems;
}

/** "1.4.3" → "1.4". */
function minor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/**
 * Bun's version is set once, in `.bun-version` (the update-tooling skill): CI and mise read it, and the Docker
 * images and Bun's types must name the same release. `@types/bun` may lag a patch release, so only its
 * major and minor must match.
 */
export function checkBunPins(
  bunVersion: string,
  dockerfiles: { file: string; text: string }[],
  typesBun: string | undefined,
): string[] {
  const version = bunVersion.trim();
  const problems: string[] = [];
  for (const { file, text } of dockerfiles) {
    for (const match of text.matchAll(/^FROM oven\/bun:(\S+)/gm)) {
      const tag = match[1]?.replace(/-(?:slim|alpine|distroless|debian)$/, "");
      if (tag !== version) {
        problems.push(`${file}: oven/bun:${match[1]} must use Bun ${version} from .bun-version`);
      }
    }
  }
  if (typesBun !== undefined && minor(typesBun) !== minor(version)) {
    problems.push(
      `root: @types/bun ${typesBun} must match Bun ${minor(version)}.x from .bun-version`,
    );
  }
  return problems;
}

export function checkPackage({ dir, manifest }: WorkspacePackage): string[] {
  const name = manifest.name ?? `(unnamed package in ${dir})`;
  const allowed = allowedInternalDependencies[name];
  const problems = checkExternalVersions(name, manifest);

  if (!allowed)
    problems.push(`${name}: unknown workspace package; add it to allowedInternalDependencies`);
  if (manifest.private !== true) problems.push(`${name}: must be "private": true`);
  if (manifest.type !== "module") problems.push(`${name}: must be "type": "module"`);

  const typeOnly = typeOnlyInternalDependencies[name] ?? [];
  for (const field of dependencyFields) {
    for (const [dependency, version] of Object.entries(manifest[field] ?? {})) {
      if (!dependency.startsWith(internalScope)) continue;
      if (version !== "workspace:*") {
        problems.push(`${name}: ${dependency} must use "workspace:*", found "${version}"`);
      }
      if (typeOnly.includes(dependency)) {
        if (field !== "devDependencies") {
          problems.push(
            `${name}: ${dependency} is for types only, so it must be a devDependency (TS-29)`,
          );
        }
      } else if (allowed && !allowed.includes(dependency)) {
        problems.push(`${name}: may not depend on ${dependency} (TS-02 layering)`);
      }
    }
  }
  return problems;
}

async function readPackageJson(file: string): Promise<PackageJson> {
  const value: unknown = await Bun.file(file).json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${file}: expected a JSON object`);
  }
  return value;
}

export async function loadWorkspace(
  rootDir: string,
): Promise<{ root: PackageJson; packages: WorkspacePackage[] }> {
  const root = await readPackageJson(path.join(rootDir, "package.json"));
  const manifestFiles = await Promise.all(
    (root.workspaces ?? []).map((pattern) =>
      Array.fromAsync(new Bun.Glob(`${pattern}/package.json`).scan({ cwd: rootDir })),
    ),
  );
  const packages = await Promise.all(
    manifestFiles.flat().map(async (file) => ({
      dir: path.join(rootDir, path.dirname(file)),
      manifest: await readPackageJson(path.join(rootDir, file)),
    })),
  );
  packages.sort((a, b) => a.dir.localeCompare(b.dir));
  return { root, packages };
}

export async function checkWorkspace(rootDir: string): Promise<string[]> {
  const { root, packages } = await loadWorkspace(rootDir);
  const bunVersion = await Bun.file(path.join(rootDir, ".bun-version")).text();
  const dockerfiles = await Promise.all(
    (await Array.fromAsync(new Bun.Glob("apps/*/Dockerfile").scan({ cwd: rootDir }))).map(
      async (file) => ({ file, text: await Bun.file(path.join(rootDir, file)).text() }),
    ),
  );
  const problems = [
    ...checkRoot(root, bunVersion),
    ...checkBunPins(bunVersion, dockerfiles, root.devDependencies?.["@types/bun"]),
    ...packages.flatMap(checkPackage),
  ];

  const present = new Set(packages.map((pkg) => pkg.manifest.name));
  for (const expected of Object.keys(allowedInternalDependencies)) {
    if (!present.has(expected))
      problems.push(`${expected}: expected workspace package is missing (TS-05)`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = await checkWorkspace(path.resolve(import.meta.dir, "../.."));
  if (problems.length > 0) {
    console.error(
      `Workspace check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("Workspace check passed.");
}
