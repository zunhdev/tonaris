import { describe, expect, test } from "bun:test";

import {
  type Advisory,
  directDependencies,
  findHits,
  githubRepository,
  isAffected,
} from "./advisories";

function advisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    ghsa_id: "GHSA-2f9c-7xj7-gh55",
    severity: "medium",
    summary: "Email OTP attempt limit can be raced",
    html_url: "https://github.com/better-auth/better-auth/security/advisories/GHSA-2f9c-7xj7-gh55",
    published_at: "2026-11-03T00:00:00Z",
    withdrawn_at: null,
    vulnerabilities: [
      {
        package: { ecosystem: "npm", name: "better-auth" },
        vulnerable_version_range: "< 1.7.16",
        patched_versions: "1.7.16",
      },
    ],
    ...overrides,
  };
}

describe("directDependencies", () => {
  test("collects external pins from every manifest, skipping workspace packages", () => {
    const deps = directDependencies([
      { devDependencies: { oxlint: "1.88.0" } },
      { dependencies: { zod: "4.6.7", "@tonaris/domain": "workspace:*" } },
      { dependencies: { zod: "4.6.7" }, devDependencies: { zod: "4.6.8" } },
    ]);
    expect([...deps.keys()].toSorted()).toEqual(["oxlint", "zod"]);
    expect([...(deps.get("zod") ?? [])].toSorted()).toEqual(["4.6.7", "4.6.8"]);
  });
});

describe("githubRepository", () => {
  test("reads the forms npm packages use", () => {
    expect(githubRepository("git+https://github.com/better-auth/better-auth.git")).toBe(
      "better-auth/better-auth",
    );
    expect(
      githubRepository({
        type: "git",
        url: "https://github.com/vitejs/vite.git",
        directory: "packages/vite",
      }),
    ).toBe("vitejs/vite");
    expect(githubRepository("github:elysiajs/elysia")).toBe("elysiajs/elysia");
    expect(githubRepository("porsager/postgres")).toBe("porsager/postgres");
    expect(githubRepository("git@github.com:TanStack/db.git")).toBe("TanStack/db");
  });

  test("is undefined off GitHub or without a repository", () => {
    expect(githubRepository("https://gitlab.com/some/project.git")).toBeUndefined();
    expect(githubRepository(undefined)).toBeUndefined();
  });
});

describe("isAffected", () => {
  test("reads GitHub's comma-separated ranges", () => {
    expect(isAffected("1.7.12", "< 1.7.16")).toBe(true);
    expect(isAffected("1.7.16", "< 1.7.16")).toBe(false);
    expect(isAffected("1.7.12", ">= 1.7.0, < 1.7.16")).toBe(true);
    expect(isAffected("1.6.9", ">= 1.7.0, < 1.7.16")).toBe(false);
  });

  test("compares pre-releases within their own release", () => {
    expect(isAffected("2.0.0-rc.0", "< 2.0.0-rc.3")).toBe(true);
    expect(isAffected("2.0.0-rc.3", "< 2.0.0-rc.3")).toBe(false);
    expect(isAffected("2.0.0-rc.0", "<= 1.4.31")).toBe(false);
  });

  test("finds a release candidate in a range its final release fixes (DRIFT-109)", () => {
    expect(isAffected("2.0.0-rc.4", "< 2.0.0")).toBe(true);
    expect(isAffected("1.0.0-rc.5", ">= 0.0.0, < 1.0.0")).toBe(true);
    expect(isAffected("1.0.0-rc.5", ">= 1.0.0, < 1.0.3")).toBe(false);
    expect(isAffected("1.0.0", "= 1.0.0")).toBe(true);
  });

  test("counts an advisory without a range, so a person reads it", () => {
    expect(isAffected("1.0.0", null)).toBe(true);
  });
});

describe("findHits", () => {
  test("reports each affected pinned version", () => {
    expect(findHits("better-auth", ["1.7.12", "1.7.22"], [advisory()])).toEqual([
      {
        dependency: "better-auth",
        version: "1.7.12",
        advisory: "GHSA-2f9c-7xj7-gh55",
        severity: "medium",
        patched: "1.7.16",
        summary: "Email OTP attempt limit can be raced",
        url: "https://github.com/better-auth/better-auth/security/advisories/GHSA-2f9c-7xj7-gh55",
      },
    ]);
  });

  test("skips other packages of the repository and withdrawn advisories", () => {
    expect(findHits("@better-auth/passkey", ["1.7.12"], [advisory()])).toEqual([]);
    expect(
      findHits("better-auth", ["1.7.12"], [advisory({ withdrawn_at: "2026-11-04T00:00:00Z" })]),
    ).toEqual([]);
  });
});
