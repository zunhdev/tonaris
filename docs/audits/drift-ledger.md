# Drift ledger

The record of the drift audits (the `audit-drift` skill in `.claude/skills/`): what each run looked at, what it found, and what the creator decided. A finding keeps its ID forever, and a decision here isn't asked again unless its evidence changes.

States: `open`, `filed TON-n`, `fixed (TON-n)`, `accepted: <reason>`, `not drift: <reason>`.

## Runs

| Date | Commit | Scope | New | Filed | Fixed | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | 2ff85b2 | First run while building the audit (TON-202): the new `check:refs` sensor, and the stack review | 5 | 0 | 5 | 0 |

## Areas

One area gets a full read per audit, the one read longest ago.

| Area | Paths | Last full read |
| --- | --- | --- |
| API | `apps/api/src` | never |
| Web app | `apps/web/src` | never |
| Domain | `packages/domain/src` | never |
| Database | `packages/db/src` | never |
| Providers | `packages/providers/src` | never |
| Design system | `packages/ui/src` | never |
| Tooling | `tooling/src` | never |
| Specs | `docs/`, `openspec/specs/` | never |

## Findings

| ID | Kind | Finding | Evidence | State | First seen | Last seen |
| --- | --- | --- | --- | --- | --- | --- |
| DRIFT-001 | spec | TS-18 put the limits in `packages/domain/limits.ts`; they live in `src/limits.ts` | `docs/tech-spec.md`, TS-18 | fixed (TON-202) | 2026-11-13 | 2026-11-13 |
| DRIFT-002 | spec | The source policy was said to be `packages/providers/policy.ts`; it is `src/policy.ts` | `docs/tech-spec.md`, TS-15 | fixed (TON-202) | 2026-11-13 | 2026-11-13 |
| DRIFT-003 | spec | `words.ts` cited DS-104, which no document defines; counts follow DS-107 | `apps/web/src/common/words.ts:1` | fixed (TON-202) | 2026-11-13 | 2026-11-13 |
| DRIFT-004 | spec | TS-07 promised Renovate update PRs, but Renovate was never set up, and dependencies fell behind security fixes (Better Auth, Vite, nodemailer) | `docs/tech-spec.md`, TS-07 | fixed (TON-202): the update-packages skill and `bun run deps:advisories` | 2026-11-13 | 2026-11-13 |
| DRIFT-005 | lesson | The local Bun (mise `latest`, 1.4.4) differed from `.bun-version` (1.4.3), CI and the Docker images | creator's mise config | fixed (TON-202): `mise.toml` reads `.bun-version`; the workspace check covers the Dockerfiles and `@types/bun` | 2026-11-13 | 2026-11-13 |
