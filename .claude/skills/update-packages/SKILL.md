---
name: update-packages
description: Upgrade the workspace's npm dependencies and GitHub Actions pins to their latest safe versions with taze, a 7-day cooldown and security checks, in one Chore PR. Use when asked to update, upgrade or bump packages or dependencies, or to fix a dependency's security advisory.
---

# Update packages

Bring every dependency up to date in one Chore PR, security fixes first, with `bun run check` green. Bun, Node and the Docker and service images belong to the **update-tooling** skill.

The rules (TS-07): every version is pinned exactly; a release waits 7 days before it is used, unless it fixes an advisory; a high or critical advisory is fixed the same day, in its own PR if the rest of the batch isn't ready.

## 1. Measure

Run all three and keep their output in the scratchpad:

- `bun run deps:advisories`: the advisories each dependency's own GitHub repository publishes. These reach GitHub's shared database late or never (Better Auth's on 3 November 2026 never did), so `bun audit` and Dependabot miss them.
- `bun audit`: GitHub's reviewed database, transitive dependencies included.
- `bun run deps:check --json`: what taze offers under `taze.config.ts` (majors included, 7-day cooldown).

taze drops a package without a word when a metadata request fails. Compare its list with `bun outdated --recursive`, and rerun `bunx taze --include <name>` for any package missing from it. With the cooldown, a package whose newest release is younger than 7 days shows the newest one that is old enough, or nothing.

**Done when** one list holds every advisory hit and every outdated package, each with its current and target version and the advisory it fixes, if any.

## 2. Plan the batch

- **Security fixes:** for each hit, the newest version that is past the cooldown and fixes it, or the fixing version itself if that is younger: `bunx taze --maturity-period 0 --include <name> -w`. Note whether the advisory touches a feature we use (Better Auth's phone and organization plugins, for example, we don't), but upgrade either way.
- **Transitive advisories** from `bun audit`: try `bun audit fix --dry-run`. If a fix needs a parent upgrade, upgrade the parent. If the parent's newest release still rules the fix out, pin the fixed version in the root `overrides`, smoke-test the parent, and record it in TS-07. Drop an override once the parent allows the fix. With no fix released, list it with its dependency path; one reached only through a dev tool, such as shadcn's CLI, weighs less.
- **Patch and minor releases:** apply together.
- **Majors and pre-release steps:** one at a time, after reading the release notes or migration guide; link them in the Linear issue. 0.x minors count as majors (oxfmt).
- **Pinned pre-releases** (Elysia, Drizzle, TanStack DB): TS-04 bumps Elysia at most every two weeks unless for security, after reading its changelog. A pre-release can carry security fixes with no advisory, so also read its commits since our version: `gh api "repos/<owner>/<repo>/commits?sha=<branch>&since=<date of our version>" --jq '.[].commit.message'`, looking for security, hardening, CVE or GHSA.

Keep each family on one version: `better-auth` and `@better-auth/*`; `elysia` and `@elysia/*` (Eden in both apps); `drizzle-orm` and `drizzle-kit` (db and tooling); `@tanstack/db` and `@tanstack/react-db`; `tailwindcss` and `@tailwindcss/vite`; `@sentry/bun` and `@sentry/browser`; the MCP server and client; `lucide-react` in web and ui; `zod` everywhere; `oxlint` and `oxlint-tsgolint`.

Ask the creator only when an upgrade would change what the product does, or would break the `/v1` contract (TS-09). Decide everything else.

## 3. Apply

Work on the branch of a Linear Chore (team TON, labels Chore and infra, "Dependency updates, <date>").

1. Write the new pins: `bunx taze -w --include <names>`, group by group, then `bun install`.
2. Follow-up steps some upgrades need:
   - `@playwright/test`: `bunx playwright install chromium`.
   - `elysia`, `@elysia/*` or `zod`: `bun run openapi:generate`, then read the diff of `apps/api/openapi/v1.json`. Only additions are allowed (TS-09).
   - `drizzle-*`: `bun run db:check`. Merged migrations are never edited.
   - `@fission-ai/openspec`: `bunx openspec update`, and commit the regenerated `.claude/commands/opsx/` and `.claude/skills/openspec-*` files.
3. `bun run format` twice (oxfmt doesn't always finish in one pass), then `bun run check`. When an upgrade breaks something, read its notes and fix forward. If the fix isn't small, put that package back on its old pin and list it as held back, with the reason.
4. `bun run build`, the native production bundles.
5. Run `bun run deps:advisories` and `bun audit` again. The hits you fixed must be gone. Explain each one left: no fix released yet, dev tool only, and so on.

**Done when** check and build pass, and every advisory still reported has a reason.

## 4. Record and publish

- Where `docs/tech-spec.md` names a version as current (its stack review, "Better Auth 1.7.12 since TON-22"), update it.
- Put the full table (package, old, new, why, advisory) in the Linear issue under Agent notes.
- Publish with the **publish-pr** skill. The PR names the advisories fixed (GHSA IDs), the majors, and anything held back. It points to the issue for the full table.
