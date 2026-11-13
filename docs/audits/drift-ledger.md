# Drift ledger

The record of the drift audits (the `audit-drift` skill in `.claude/skills/`): what each run looked at, what it found, and what the creator decided. A finding keeps its ID forever, and a decision here isn't asked again unless its evidence changes.

States: `open`, `filed TON-n`, `fixed (TON-n)`, `accepted: <reason>`, `not drift: <reason>`.

## Runs

| Date | Commit | Scope | New | Filed | Fixed | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | 2ff85b2 | First run while building the audit (TON-202): the new `check:refs` sensor, and the stack review | 5 | 0 | 5 | 0 |
| 2026-11-13 | d82479e | The four commits since 2ff85b2, and a full read of the API area. During closed testing the creator asked to fix every finding, whatever its size: the small ones in TON-206, the rest in TON-207, TON-208 and TON-209 | 24 | 0 | 24 | 0 |

## Areas

One area gets a full read per audit, the one read longest ago.

| Area | Paths | Last full read |
| --- | --- | --- |
| API | `apps/api/src` | 2026-11-13 |
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
| DRIFT-006 | spec | A signed-in viewer's stream of a share didn't end with its session, as TS-23 promises | `docs/tech-spec.md`, TS-23; `apps/api/src/sse.ts`, `routes/v1/shared.ts` | fixed (TON-207) | 2026-11-13 | 2026-11-13 |
| DRIFT-007 | spec | TS-104's mutation and guest-view limits were Proposed and never built | `docs/tech-spec.md`, TS-104; `apps/api/src/sync/routes.ts`, `routes/v1/guests.ts` | fixed (TON-207): the creator decided to build both and drop the `RateLimit` headers | 2026-11-13 | 2026-11-13 |
| DRIFT-008 | spec | TS-102 said every non-GET must send JSON; the code checks POSTs only and exempts the OAuth form endpoints | `docs/tech-spec.md`, TS-102; `apps/api/src/security.ts` | fixed (TON-206) | 2026-11-13 | 2026-11-13 |
| DRIFT-009 | spec | TS-09 promised cursor pages, a `mutationId` on every write and `RateLimit` headers, which REST routes don't have | `docs/tech-spec.md`, TS-09; `routes/v1/connections.ts`, `export.ts` | fixed (TON-206): scoped to the sync envelope, REST writes recorded as built | 2026-11-13 | 2026-11-13 |
| DRIFT-010 | spec | TS-74 and TS-113 called `account.deleted` and the role-lowered event not built | `docs/tech-spec.md`, TS-74, TS-113; `packages/db/src/account-deletion.ts` | fixed (TON-206) | 2026-11-13 | 2026-11-13 |
| DRIFT-011 | spec | TS-24 credited three behaviours to TanStack DB 0.15.1 after the move to the 1.0 RC | `docs/tech-spec.md`, TS-24; `apps/web/package.json` | fixed (TON-206): each re-read in 1.0.0-rc.1.4's source | 2026-11-13 | 2026-11-13 |
| DRIFT-012 | spec | The export's contract said format 1.0; the export is 1.2 | `apps/api/src/routes/v1/export.ts`; `packages/domain/src/export.ts` | fixed (TON-206): the description reads the domain's constants | 2026-11-13 | 2026-11-13 |
| DRIFT-013 | spec | TS-23 promised `{rootId, ownerSeq}` and narrowing to affected roots for viewers; neither was built | `docs/tech-spec.md`, TS-23; `packages/domain/src/sharing.ts` | fixed (TON-206) | 2026-11-13 | 2026-11-13 |
| DRIFT-014 | spec | TS-30 named an `Authorization: Share` header that nothing reads | `docs/tech-spec.md`, TS-30; `routes/v1/guests.ts` | fixed (TON-206) | 2026-11-13 | 2026-11-13 |
| DRIFT-015 | spec | TS-27's error codes missed `recipient_not_found` and `display_name_required` | `docs/tech-spec.md`, TS-27; `packages/domain/src/outcomes.ts` | fixed (TON-206): `check:refs` now compares the list with `errorCodes` | 2026-11-13 | 2026-11-13 |
| DRIFT-016 | spec | Stale lines: `confirm_match` under `destructiveHint`, a "pending enrichment state", an "enrichment queue" | `docs/tech-spec.md`, TS-41, TS-63, TS-91 | fixed (TON-206) | 2026-11-13 | 2026-11-13 |
| DRIFT-017 | architecture | MCP `move_items` said nothing to an editor's agent when who sees it changes; the app does | `routes/v1/sharing.ts`; `mcp/write-tools.ts` | fixed (TON-208): one `previewSharing` for both | 2026-11-13 | 2026-11-13 |
| DRIFT-018 | architecture | The editor's "inside the share" rules were written again in `packages/db` | `packages/domain/src/command-kit.ts`; `packages/db/src/sharing-impact.ts`, `mcp.ts` | fixed (TON-208): pure domain predicates | 2026-11-13 | 2026-11-13 |
| DRIFT-019 | architecture | Capture had two meanings of an album an editor sees: can edit (API), can read (domain) | `apps/api/src/capture.ts`; `packages/domain/src/capture.ts` | fixed (TON-208): the domain's `albumSeenBy` on both sides | 2026-11-13 | 2026-11-13 |
| DRIFT-020 | architecture | MCP write answers skip the provider-policy filter (TS-15) | `apps/api/src/mcp/results.ts` | fixed (TON-208): a test keeps every source agent-visible until write answers filter | 2026-11-13 | 2026-11-13 |
| DRIFT-021 | architecture | The web app had its own tree walks, and its move check ignored the depth limit | `apps/web/src/features/collection/tree.ts`, `client/sync/trash.ts`; `packages/domain/src/container-tree.ts` | fixed (TON-208): the domain's walks and `moveProblem` | 2026-11-13 | 2026-11-13 |
| DRIFT-022 | architecture | Admission refusals were checked twice, in opposite order | `apps/api/src/auth/admission.ts`; `packages/db/src/admission.ts` | fixed (TON-206): one `admissionRefusal` in the domain | 2026-11-13 | 2026-11-13 |
| DRIFT-023 | architecture | Bun.SQL reached past `client.ts`, and lint still named the departed `postgres` | `packages/db/src/client.ts`, `create-database.ts`, `testing.ts`; `.oxlintrc.json` | fixed (TON-206): `openConnection` and `closeDatabase` | 2026-11-13 | 2026-11-13 |
| DRIFT-024 | lesson | Editor and agent paths kept assuming the acting person owns the collection (TON-192, TON-193, TON-195, TON-200) | `packages/db/src/mcp-writes.ts`; `apps/api/src/mcp/gated-tools.ts` | fixed (TON-208): `userId` names, and a test that runs every MCP write tool as an editor's agent | 2026-11-13 | 2026-11-13 |
| DRIFT-025 | lesson | Long text at narrow widths broke four times, found only by hand (TON-152, TON-156, TON-165, TON-180) | `apps/web/e2e/` | fixed (TON-209): `worst-case.e2e.ts` and `textProblems`; its first run found a breadcrumb that shrank to nothing | 2026-11-13 | 2026-11-13 |
| DRIFT-026 | lesson | The inspector's close navigation was copied by hand, the TON-118 class | `apps/web/src/features/collection/delete-containers.tsx` | fixed (TON-206): `useInspector().close()` | 2026-11-13 | 2026-11-13 |
| DRIFT-027 | lesson | `--text-input` still shared the `input` colour's name (TON-101, TON-147) | `packages/ui/src/styles/tokens.css` | fixed (TON-206): `text.control`, and a test against any size named like a colour | 2026-11-13 | 2026-11-13 |
| DRIFT-028 | lesson | Missing production build files were invisible to the browser tests (TON-126, TON-179) | `.github/workflows/images.yml` | fixed (TON-209): the smoke step fetches every build file | 2026-11-13 | 2026-11-13 |
| DRIFT-029 | smell | The "a Tonaris member" fallback was written in 13 places | `apps/web/src`, `apps/api/src/mcp/read-tools.ts`, `invitations.ts` | fixed (TON-206): one `ownerLabel` in the domain | 2026-11-13 | 2026-11-13 |
