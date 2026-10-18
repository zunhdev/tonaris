import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  checkPackage,
  checkRoot,
  checkWorkspace,
  internalDependencies,
  loadWorkspace,
  type PackageJson,
} from "./workspace-check";

const rootDir = path.resolve(import.meta.dir, "../..");

/** Whether Bun resolves `specifier` from `fromDir`, without running the module (some are type-only). */
function canResolve(fromDir: string, specifier: string): boolean {
  try {
    Bun.resolveSync(specifier, fromDir);
    return true;
  } catch {
    return false;
  }
}

describe("repository workspace", () => {
  test("follows the layering and pinning rules", async () => {
    expect(await checkWorkspace(rootDir)).toEqual([]);
  });

  test("every package resolves the internal packages it declares", async () => {
    const { packages } = await loadWorkspace(rootDir);
    const unresolved = packages.flatMap((pkg) =>
      internalDependencies(pkg.manifest)
        .filter((dependency) => !canResolve(pkg.dir, dependency))
        .map((dependency) => `${pkg.manifest.name} -> ${dependency}`),
    );
    expect(unresolved).toEqual([]);
  });

  test("isolated installs reject internal packages a package does not declare", () => {
    expect(canResolve(path.join(rootDir, "apps/web"), "@tonaris/db")).toBe(false);
    expect(canResolve(path.join(rootDir, "packages/domain"), "@tonaris/db")).toBe(false);
  });
});

function web(manifest: PackageJson = {}) {
  return {
    dir: "apps/web",
    manifest: { name: "@tonaris/web", private: true, type: "module", ...manifest },
  };
}

describe("checkPackage", () => {
  test("accepts exact versions and allowed workspace references", () => {
    const problems = checkPackage(
      web({
        dependencies: { "@tonaris/domain": "workspace:*", react: "19.2.0" },
        devDependencies: { "some-tool": "2.0.0-beta.32" },
      }),
    );
    expect(problems).toEqual([]);
  });

  test("rejects version ranges and tags", () => {
    const problems = checkPackage(
      web({ dependencies: { zod: "^4.2.0", vite: "latest", react: "19.x" } }),
    );
    expect(problems).toHaveLength(3);
    expect(problems.every((problem) => problem.includes("exact version"))).toBe(true);
  });

  test("rejects internal dependencies that break the layering", () => {
    expect(checkPackage(web({ dependencies: { "@tonaris/db": "workspace:*" } }))).toEqual([
      "@tonaris/web: may not depend on @tonaris/db (TS-02 layering)",
    ]);
  });

  test("allows type-only internal dependencies only as devDependencies", () => {
    expect(checkPackage(web({ devDependencies: { "@tonaris/api": "workspace:*" } }))).toEqual([]);
    expect(checkPackage(web({ dependencies: { "@tonaris/api": "workspace:*" } }))).toEqual([
      "@tonaris/web: @tonaris/api is for types only, so it must be a devDependency (TS-29)",
    ]);
  });

  test("requires the workspace protocol for internal dependencies", () => {
    expect(checkPackage(web({ dependencies: { "@tonaris/ui": "0.0.0" } }))).toEqual([
      '@tonaris/web: @tonaris/ui must use "workspace:*", found "0.0.0"',
    ]);
  });

  test("rejects unknown, public or CommonJS packages", () => {
    const problems = checkPackage({ dir: "packages/extra", manifest: { name: "@tonaris/extra" } });
    expect(problems).toEqual([
      "@tonaris/extra: unknown workspace package; add it to allowedInternalDependencies",
      '@tonaris/extra: must be "private": true',
      '@tonaris/extra: must be "type": "module"',
    ]);
  });
});

describe("checkRoot", () => {
  test("requires packageManager to match .bun-version", () => {
    expect(checkRoot({ packageManager: "bun@1.4.3" }, "1.4.3\n")).toEqual([]);
    expect(checkRoot({ packageManager: "bun@1.4.2" }, "1.4.3\n")).toEqual([
      'root: packageManager must be "bun@1.4.3" to match .bun-version, found "bun@1.4.2"',
    ]);
  });

  test("requires exact versions for root dependencies", () => {
    expect(
      checkRoot(
        { packageManager: "bun@1.4.3", devDependencies: { "@types/bun": "~1.4.3" } },
        "1.4.3",
      ),
    ).toEqual(['root: @types/bun must be pinned to an exact version, found "~1.4.3" (TS-07)']);
  });
});
