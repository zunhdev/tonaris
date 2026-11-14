# Drift ledger

The record of the drift audits (the `audit-drift` skill in `.claude/skills/`): what each run looked at, what it found, and what the creator decided. A finding keeps its ID forever, and a decision here isn't asked again unless its evidence changes.

States: `open`, `filed TON-n`, `fixed (TON-n)`, `accepted: <reason>`, `not drift: <reason>`.

## Runs

| Date | Commit | Scope | New | Filed | Fixed | Accepted |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | 2ff85b2 | First run while building the audit (TON-202): the new `check:refs` sensor, and the stack review | 5 | 0 | 5 | 0 |
| 2026-11-13 | d82479e | The four commits since 2ff85b2, and a full read of the API area. During closed testing the creator asked to fix every finding, whatever its size: the small ones in TON-206, the rest in TON-207, TON-208 and TON-209 | 24 | 0 | 24 | 0 |
| 2026-11-13 | fbb1ba2 | Every area: full reads of the web app, domain, database, providers, design system, tooling and specs, and the changes merged in TON-206 to TON-209 (TON-210). DRIFT-019's other half reopened. Fixed one issue at a time, TON-211 to TON-225 | 85 | 29 | 56 | 0 |

## Areas

One area gets a full read per audit, the one read longest ago.

| Area | Paths | Last full read |
| --- | --- | --- |
| API | `apps/api/src` | 2026-11-13 |
| Web app | `apps/web/src` | 2026-11-13 |
| Domain | `packages/domain/src` | 2026-11-13 |
| Database | `packages/db/src` | 2026-11-13 |
| Providers | `packages/providers/src` | 2026-11-13 |
| Design system | `packages/ui/src` | 2026-11-13 |
| Tooling | `tooling/src` | 2026-11-13 |
| Specs | `docs/`, `openspec/specs/` | 2026-11-13 |

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
| DRIFT-019 | architecture | Capture had two meanings of an album an editor sees: can edit (API), can read (domain). Half fixed: capture still asks MusicBrainz before refusing a list in Trash, or one the editor can only view | `apps/api/src/capture.ts`; `packages/domain/src/capture.ts` | fixed (TON-208, TON-214) | 2026-11-13 | 2026-11-13 |
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
| DRIFT-030 | spec | `docs/api/sync-protocol.md`, the contract native clients build from, lags the API: no reference entity, no container colour, six mutations missing, no editor section | `docs/api/sync-protocol.md`; `apps/api/openapi/v1.json` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-031 | spec | Approvals that are done still read as open: PRD D6, TS-120's header, §16 rows 3, 4 and 7, TS-114's "30 days" | `docs/product-requirements.md` D6; `docs/tech-spec.md` TS-114, TS-120, §16 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-032 | spec | The PRD change log misses TON-104, TON-143 and TON-201, which changed FR-06.6, the passkey FRs and FR-12.5 | `docs/product-requirements.md` §11 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-033 | spec | TS-124 says production deploys by tag or by hand, and that WebKit needs HTTPS locally; neither holds | `docs/tech-spec.md` TS-124; `render.yaml`; `docs/deploy.md` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-034 | spec | A reviewer rule still says every write carries a `mutationId`, which DRIFT-009 corrected in TS-09 | `.claude/skills/review-pr/repo-rules.md` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-035 | spec | `openspec/config.yaml` still names postgres.js | `openspec/config.yaml` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-036 | spec | TS-132's capability table names two capabilities that don't exist and misses six; the search spec's purpose predates shared search | `docs/tech-spec.md` TS-132; `openspec/specs/search/spec.md` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-037 | spec | TS-46 and TS-131 are marked Proposed, though both are in force | `docs/tech-spec.md` TS-46, TS-131 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-038 | spec | The README says sharing is read-only | `README.md`; `docs/product-requirements.md` FR-07 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-039 | spec | PRD G1 states a hint rule the tech spec widened (singles, YouTube Music hints; TON-163) | `docs/product-requirements.md` G1; `docs/tech-spec.md` TS-41 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-040 | spec | DS-49 says adding albums to lists and sharing previews aren't built yet; both are | `docs/design-spec.md` DS-49 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-041 | spec | TS-08 and §13 call the domain a placeholder and Render a "current preference"; both were decided | `docs/tech-spec.md` TS-08, §13 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-042 | spec | DS-72 keeps link previews text-only "until G1 clears artwork use"; G1 closed with nothing recorded | `docs/design-spec.md` DS-72 | filed TON-225 | 2026-11-13 | 2026-11-13 |
| DRIFT-043 | spec | The restore runbook's replayed events leave out passkey removals and lowered share roles | `docs/runbooks/restore.md`; `packages/db/src/ledger-replay.ts` | fixed (TON-217) | 2026-11-13 | 2026-11-13 |
| DRIFT-044 | spec | Viewer and guest pages don't notice a silent stream or resume after sleep, an editor's share client doesn't resume, and an open share and the sidebar open two streams to one share (TS-24) | `apps/web/src/features/sharing/use-share-stream.ts`, `editable-share.tsx`; `apps/web/src/client/sync/share-engine.ts` | fixed (TON-211) | 2026-11-13 | 2026-11-13 |
| DRIFT-045 | spec | Retry on a failed new album, after a reload or after leaving a share, files it in the editor's own collection | `apps/web/src/features/collection/new-album.tsx`; `apps/web/src/client/sync/resubmit.ts` | fixed (TON-213) | 2026-11-13 | 2026-11-13 |
| DRIFT-046 | architecture | The web app decides "the share's own folder or list" itself, more strictly than the domain | `apps/web/src/features/collection/views.tsx`, `move.tsx`, `delete-containers.tsx`; `packages/domain/src/command-kit.ts` | fixed (TON-213) | 2026-11-13 | 2026-11-13 |
| DRIFT-047 | architecture | Naming in a share checks only for a blank name, in its own words; the sidebar's name field allows 400 characters, not 200 | `apps/web/src/features/collection/name-dialog.tsx`, `name-editor.tsx`; `packages/domain/src/containers.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-048 | architecture | The album form and inline editor write their own required-field and year rules (FR-02.6) | `apps/web/src/features/collection/album-form.ts`, `album-edit.ts`; `packages/domain/src/albums.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-049 | smell | Three hand-written tree walks survived DRIFT-021; the folder deletion's count walks differently from the deletion | `apps/web/src/features/collection/delete-containers.tsx`, `collection-tree.tsx`, `container-palette.tsx` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-050 | smell | Links into a share's folders are built by hand in about 8 places, two as raw strings with no route checking | `apps/web/src/features/collection/place.tsx`, `collection-tree.tsx`, `views.tsx`; `apps/web/src/features/sharing/shared-view.tsx` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-051 | smell | "Insert or update" for links and view choices is written at each call site | `apps/web/src/features/collection/album-links.tsx`, `paste-onto-album.ts`, `data.tsx`, `use-presentation.ts` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-052 | architecture | The album panel's "which year sorts" hint and editor rewrite the domain's `chronology` | `apps/web/src/features/collection/album-details.tsx`, `album-edit.ts`; `packages/domain/src/order.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-053 | spec | Adding an album to, or removing it from, a shared list tells an editor the owner's album is in Trash (FR-07.21) | `packages/domain/src/memberships.ts`; `packages/domain/src/capture.ts` `albumSeenBy` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-054 | spec | An agent's `confirm_match` calls a view-only album "new", while the capture reuses it | `packages/db/src/mcp.ts` `sharedMatchTarget` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-055 | architecture | Which owner's change log a mutation reaches is decided in the database, apart from the commands | `packages/db/src/sync.ts` `targetOf`; `packages/domain/src/commands.ts` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-056 | architecture | `editSourcesAbove` isn't in the property test that holds the SQL walks equal to the model; sharing settings have a third copy | `packages/db/src/access.ts`, `sharing.ts`, `sharing.test.ts` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-057 | architecture | Folder paths and depths are walked again in search, MCP and Trash recovery, one with no cycle guard; the move command re-decides `moveProblem` | `packages/db/src/search.ts`, `mcp-reads.ts`; `packages/domain/src/trash.ts`, `containers.ts` | fixed (TON-221) | 2026-11-13 | 2026-11-13 |
| DRIFT-058 | smell | An editor's snapshot copies the owner's field read, and the options query appears a third time | `packages/db/src/sharing.ts`, `field-values.ts` | fixed (TON-221) | 2026-11-13 | 2026-11-13 |
| DRIFT-059 | architecture | "The creator can't delete their account" is decided in the database and copied in the web app | `packages/db/src/account-deletion.ts`; `apps/web/src/features/account/delete-account.tsx` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-060 | smell | The database package exports access checks nothing outside it uses, the kind that led to DRIFT-019 | `packages/db/src/index.ts` | fixed (TON-221) | 2026-11-13 | 2026-11-13 |
| DRIFT-061 | spec | An export carries the person's view choices and order on other owners' shared content, and a purge leaves view and order rows behind (FR-08.4) | `packages/db/src/export.ts`, `teardowns.ts`; `packages/domain/src/export.ts` | fixed (TON-215) | 2026-11-13 | 2026-11-13 |
| DRIFT-062 | spec | TS-18's limit of 100 saved shared references is enforced nowhere | `docs/tech-spec.md` TS-18; `packages/domain/src/sharing.ts`, `limits.ts` | fixed (TON-216) | 2026-11-13 | 2026-11-13 |
| DRIFT-063 | spec | Pasting a link only a trashed album has restores it beside an active album of the same release group (FR-14.3) | `packages/domain/src/capture.ts`, `trash.ts` | fixed (TON-216) | 2026-11-13 | 2026-11-13 |
| DRIFT-064 | spec | A ledger append that fails 3 times is buried and pruned after 30 days, so a restore can revive what was deleted (TS-113) | `apps/api/src/jobs/worker.ts`, `ledger.ts`; `packages/db/src/jobs.ts` | fixed (TON-217) | 2026-11-13 | 2026-11-13 |
| DRIFT-065 | spec | The 100-captures-an-hour limit counts refused and failed attempts, so retrying while refused extends the lockout | `packages/db/src/capture.ts`; `apps/api/src/sync/runner.ts` | fixed (TON-216) | 2026-11-13 | 2026-11-13 |
| DRIFT-066 | spec | Four as-built notes no longer hold: TS-42 artwork, TS-33 accepting, TS-18 editors' captures, TS-24's per-root search index | `docs/tech-spec.md` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-067 | spec | TS-11's table outline misses the editor model's columns (`role`, `deleted_by`) and others | `docs/tech-spec.md` TS-11; `packages/db/src/schema` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-068 | spec | Small contract statements: `approvalId` in TS-20, `pending` in TS-25, TS-11's value CHECK, two "App-only" comments | `docs/tech-spec.md`; `packages/domain/src/sync.ts` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-069 | spec | An editor's unsent writes in a share are never sent again, and outlive sign-out and account deletion (TS-22) | `apps/web/src/features/sharing/editable-share.tsx`; `apps/web/src/client/sync/outbox.ts`, `persistence.ts` | fixed (TON-212) | 2026-11-13 | 2026-11-13 |
| DRIFT-070 | spec | A move applies at once, before its sharing preview, with no confirmation (DS-49, FR-07.14) | `apps/web/src/features/collection/drag.tsx`, `move.tsx` | filed TON-226 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-071 | spec | The sharing glyph on the owner's shared folders and lists was never built (DS-27, DS-31, DS-41) | `apps/web/src/features/collection/container-rows.tsx`, `collection-tree.tsx` | filed TON-227 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-072 | spec | ⌫ doesn't remove an album from the list on view (DS-45, DS-50, DS-78) | `apps/web/src/features/shell/use-shortcuts.ts` | filed TON-228 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-073 | spec | Under live changes, focus is kept by position rather than by item, and editors get no highlight (DS-82) | `apps/web/src/features/collection/use-grid.ts`; `apps/web/src/client/sync/share-engine.ts` | fixed (TON-225) | 2026-11-13 | 2026-11-13 |
| DRIFT-074 | spec | The header's Delete list and Delete folder work offline (DS-81) | `apps/web/src/features/collection/views.tsx`, `delete-containers.tsx` | fixed (TON-213) | 2026-11-13 | 2026-11-13 |
| DRIFT-075 | spec | Move to position…, dragging albums onto a sidebar list, and multi-select are promised but were parked | `docs/design-spec.md` DS-21, DS-45, DS-49, DS-50, DS-78 | filed TON-229, TON-230, TON-231 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-076 | spec | Deleting a folder doesn't name its sharing effects (DS-28, DS-50) | `apps/web/src/features/collection/delete-containers.tsx` | filed TON-226 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-077 | spec | DS-20 still names react-day-picker; date fields use the browser's own picker | `docs/design-spec.md` DS-20; `apps/web/src/features/collection/field-editors.tsx` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-078 | smell | Stale code comments: custom fields "coming later", layout "lists only", a removed `use-mode.ts`, DS-83 for DS-82, and others | `apps/web/src/features/collection/new-album.tsx`, `view-options.tsx`; `packages/ui/src/components/select.tsx` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-079 | spec | Pasting links on a shared list saves to the editor's own Unsorted; Add albums in a share opens with no list (DS-48) | `apps/web/src/features/capture/capture-context.tsx` | fixed (TON-213) | 2026-11-13 | 2026-11-13 |
| DRIFT-080 | spec | ⇧S and the palette's Share… inside a share the person edits open the owner's sharing dialog, which fails | `apps/web/src/features/shell/use-shortcuts.ts`; `apps/web/src/features/search/search-palette.tsx` | fixed (TON-213) | 2026-11-13 | 2026-11-13 |
| DRIFT-081 | spec | Every workspace error, a 500 on one settings page included, reads "Couldn't reach Tonaris" and replaces the whole shell | `apps/web/src/routes/_workspace.tsx`, `router.tsx` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-082 | architecture | Capture's choice and details candidates are typed only where the web app reads them | `apps/web/src/features/capture/outcomes.ts`; `packages/domain/src/outcomes.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-083 | architecture | The consent page's mode rule copies the domain's `mcpModeOf` | `apps/web/src/features/connections/oauth.ts`; `packages/domain/src/principals.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-084 | architecture | The sharing forms' sender copies the outbox's answer rules but not its 10 s timeout | `apps/web/src/features/sharing/send.ts`; `apps/web/src/client/sync/transport.ts` | fixed (TON-219) | 2026-11-13 | 2026-11-13 |
| DRIFT-085 | smell | The "Couldn't reach Tonaris" sentence is written in 8+ places, in two wordings | `apps/web/src/features/sharing/send.ts`; `apps/web/src/features/account/auth-client.ts` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-086 | smell | The supported services are typed into copy 6 times; the providers package derives them | `apps/web/src/features/capture/capture-dialog.tsx`; `packages/providers/src/links.ts` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-087 | spec | The installed app's theme colour is the graphite from before TON-167 (DS-110) | `apps/web/src/routes/__root.tsx`; `apps/web/public/manifest.webmanifest`; `packages/ui/src/styles/tokens.css` | fixed (TON-218) | 2026-11-13 | 2026-11-13 |
| DRIFT-088 | smell | Smaller duplications: route paths re-parsed with regexes, a folder's contents phrased five ways, guest defaults copied, `contentsOf` twice, 37 focus-ring classes | `apps/web/src/common/device.ts`; `apps/web/src/features/trash/trash-view.tsx`; `apps/web/src/features/guest/guest-view.ts` | fixed (TON-220) | 2026-11-13 | 2026-11-13 |
| DRIFT-089 | spec | On a phone, the palette offers edit commands that work, though X-04 keeps collection edits desktop-only | `apps/web/src/features/search/search-palette.tsx`; `apps/web/src/features/shell/use-shortcuts.ts` | fixed (TON-218) | 2026-11-13 | 2026-11-13 |
| DRIFT-090 | spec | Redaction misses percent-encoded emails and codes after `#`, as in the sign-in and join links (TS-115) | `packages/domain/src/telemetry.ts` | fixed (TON-215) | 2026-11-13 | 2026-11-13 |
| DRIFT-091 | spec | The sync indicator and Activity read only the person's own client, not an open share's | `apps/web/src/features/shell/shell.tsx`; `apps/web/src/features/sync/sync-provider.tsx` | fixed (TON-225) | 2026-11-13 | 2026-11-13 |
| DRIFT-092 | spec | Removing a used option or deleting a field doesn't name the effect on shared views (FR-03.17, FR-03.18) | `apps/web/src/features/settings/custom-fields.tsx` | filed TON-226 (decided in TON-225: build) | 2026-11-13 | 2026-11-13 |
| DRIFT-093 | spec | Several phone controls are under DS-15's 44 px | `apps/web/src/features/guest/guest-page.tsx`, `link-banner.tsx`; `packages/ui/src/components/toast.tsx`, `dialog.tsx` | fixed (TON-218) | 2026-11-13 | 2026-11-13 |
| DRIFT-094 | spec | Shortcut hints show ⌘ on Windows and Linux (DS-29, DS-78) | `apps/web/src/features/shell/sidebar.tsx`; `apps/web/src/common/shortcuts.ts` | fixed (TON-218) | 2026-11-13 | 2026-11-13 |
| DRIFT-095 | spec | Buttons in ordinary dialogs are 28 px, beside 32 px fields (DS-15) | `packages/ui/src/components/alert-dialog.tsx`, `dialog.tsx` | fixed (TON-218) | 2026-11-13 | 2026-11-13 |
| DRIFT-096 | spec | DS-81 says phones and guest pages are still waiting for their sync-indicator surfaces | `docs/design-spec.md` DS-81 | filed TON-225 | 2026-11-13 | 2026-11-13 |
| DRIFT-097 | spec | DS-25 describes an Open popover removed in TON-127; TS-101's no-referrer covers `/join/` and `/recover/` too | `docs/design-spec.md` DS-25; `docs/tech-spec.md` TS-101 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-098 | lesson | Reads that leave out the "not in Trash" filter leaked Trash content several times; the filter is written by hand 36 times | `packages/db/src/access.ts`, `sharing.ts`, `mcp.ts` | fixed (TON-222) | 2026-11-13 | 2026-11-13 |
| DRIFT-099 | lesson | CSP violations on server-rendered pages were found in production by hand (TON-126); 3 pages are watched | `apps/web/e2e/security.e2e.ts` | fixed (TON-222) | 2026-11-13 | 2026-11-13 |
| DRIFT-100 | lesson | Browser tests act while something animates: axe mid-fade (3 times), keys during a dialog's exit (twice) | `apps/web/e2e` | fixed (TON-222) | 2026-11-13 | 2026-11-13 |
| DRIFT-101 | architecture | Read-only connections are refused in each command, not in one place, and a miss has happened | `packages/db/src/sync.ts`; `packages/domain/src/policies.ts` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-102 | architecture | A stream can be opened without the session it should end with: the hub's session is optional | `apps/api/src/sync/hub.ts`; `apps/api/src/sse.ts` | fixed (TON-211) | 2026-11-13 | 2026-11-13 |
| DRIFT-103 | lesson | Text limits counted in UTF-16 units, not code points (TON-151); three remain | `packages/domain/src/passkeys.ts`, `accounts.ts`; `apps/web/src/features/collection/name-editor.tsx` | fixed (TON-222) | 2026-11-13 | 2026-11-13 |
| DRIFT-104 | spec | `bun run seed:workload` fails on a foreign key once the workload account has saved a default | `tooling/src/workload/seed.ts` | fixed (TON-223) | 2026-11-13 | 2026-11-13 |
| DRIFT-105 | lesson | Six "refused" rows in TON-208's every-tool editor test pass without the ownership check: a mistake in TON-208 | `apps/api/src/mcp/shared-editing.test.ts` | fixed (TON-214) | 2026-11-13 | 2026-11-13 |
| DRIFT-106 | spec | A guest page that gets a 429 from the guest-view limit shows "not available" and stops following: a mistake in TON-207 | `apps/web/src/routes/s.$token.tsx` | fixed (TON-211) | 2026-11-13 | 2026-11-13 |
| DRIFT-107 | lesson | `check:refs` runs nowhere in CI | `.github/workflows/ci.yml`; `docs/tech-spec.md` TS-124 | fixed (TON-222) | 2026-11-13 | 2026-11-13 |
| DRIFT-108 | spec | The store-page request counts leave out the one redirect the code follows; TS-41 contradicts itself | `openspec/specs/metadata-sources/spec.md`; `packages/providers/src/store-pages.ts` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-109 | spec | `bun run deps:advisories` can't flag a release-candidate pin | `tooling/src/deps/advisories.ts` | fixed (TON-223) | 2026-11-13 | 2026-11-13 |
| DRIFT-110 | spec | TS-103 says every outbound call goes through `safeFetch`; SMTP, the S3 ledger, Sentry and CIMD don't | `docs/tech-spec.md` TS-103; `packages/providers/src/safe-fetch.ts` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-111 | spec | FR-02.4 promises a prefilled form, which the terms decision limits to Apple's hints; FR-02.9 lists G2 as open | `docs/product-requirements.md` FR-02.4, FR-02.9 | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-112 | spec | TS-40 and the link-capture spec say four services, not five; TS-11's provider-cache row misses two entries | `docs/tech-spec.md` TS-11, TS-40; `packages/providers/src/links.ts` | filed TON-224 | 2026-11-13 | 2026-11-13 |
| DRIFT-113 | spec | An unexpected provider answer fails capture as a 500 instead of "provider unavailable" | `packages/providers/src/itunes.ts`, `spotify.ts`, `youtube.ts`, `musicbrainz.ts` | fixed (TON-216) | 2026-11-13 | 2026-11-13 |
| DRIFT-114 | smell | Small provider leaks: the Spotify health check in the API's schedules, a hard-coded MusicBrainz failure, the covers route's own sentence, drifted workload link formats, an unreachable branch | `apps/api/src/jobs/schedules.ts`, `capture.ts`; `tooling/src/workload/generate.ts` | fixed (TON-221) | 2026-11-13 | 2026-11-13 |
