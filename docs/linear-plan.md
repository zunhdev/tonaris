# Tonaris — Linear seed plan

This file seeds the initial Linear structure from the tech spec's delivery plan ([TS-131](tech-spec.md)). Once the structure exists in Linear, **Linear is the source of truth** and this file can be deleted.

**Created in Linear on 17 October 2026** (team `TON`).

- **Initiatives:** I-2 Foundations & feasibility, I-3 Tonaris v1 product, I-4 v1 acceptance.
- **Projects:** P-TON-12 to P-TON-23, one per milestone M0–M11.
- **Issue keys** map in order:

  | Seed keys | Linear issues |
  | --- | --- |
  | M0-01–M0-12 | TON-1–TON-12 |
  | M1-01–M1-13 | TON-13–TON-25 |
  | M2-01–M2-13 | TON-26–TON-38 |
  | M3-01–M3-10 | TON-39–TON-48 |
  | M4-01–M4-06 | TON-49–TON-54 |
  | M5-01–M5-06 | TON-55–TON-60 |
  | M6-01–M6-03 | TON-61–TON-63 |
  | M7-01–M7-09 | TON-64–TON-72 |
  | M8-01–M8-07 | TON-73–TON-79 |
  | M9-01–M9-07 | TON-80–TON-86 |
  | M10-01–M10-04 | TON-87–TON-90 |
  | M11-01–M11-08 | TON-91–TON-98 |

- **Issue dependencies** are set as "blocked by" relations. Two were added beyond the tables below:
  - TON-66 is also blocked by TON-73 (invitations need email);
  - TON-79 is also blocked by TON-89 (the deletion dialog embeds the export).
- **Labels differ from the plan in two ways:**
  - Feature and Bug reuse the existing workspace labels.
  - The Area group is single-select, because multi-select groups aren't enabled in the workspace.
- **Project-to-project dependencies** were not created; the Linear tools can't set them. Add them by hand if you want them on the Timeline.

## Conventions

- **Team:** Tonaris. Everything is assigned to the creator: issues to the assignee, projects to the lead, initiatives to the owner.
- **Issue description template:**

  ```
  <one-sentence goal>

  Trace
  Implements: FR-…
  Design:     DS-…
  Tech:       TS-…
  Verifies:   AC-…

  Done when: <exit check>
  ```

- **One issue = one OpenSpec change = one branch/PR** (TS-132). Coarse issues in later projects are split when their project starts.
- **States:** M0 issues start in *Todo*; everything else starts in *Backlog*.
- **Priority:** M0 and M1 are High; M2–M5 Medium; M6–M11 Low.

## Labels

Each group is exclusive in Linear, so an issue carries at most one label per group.

| Group | Labels |
| --- | --- |
| Type | `Feature`, `Spike`, `Chore`, `Design`, `Bug` (reuse workspace defaults if they exist) |
| Capability (OpenSpec, TS-132) | `collection-hierarchy`, `album-records`, `album-capture`, `edition-matching`, `custom-fields`, `trash-and-recovery`, `views-and-ordering`, `service-links`, `sharing`, `data-export`, `sync-and-conflicts`, `mcp-access`, `accounts`, `admission`, `search`, `capacity-limits` |
| Gate | `G1`, `G2`, `G3` |
| Area | `web`, `api`, `domain`, `infra`, `docs` |

## Initiatives

| Initiative | Projects | Goal |
| --- | --- | --- |
| Foundations & feasibility | M0, M1 | A working skeleton, plus G1–G3 answered with evidence, before building features |
| Tonaris v1 product | M2–M10 | Every first-version capability in the PRD |
| v1 acceptance | M11 | All AC checks pass, quality targets met, and pending approvals recorded |

## Projects

| Project | Initiative | Blocked by | Exit checks |
| --- | --- | --- | --- |
| M0 Foundations | Foundations & feasibility | — | Both services build and run locally and in Docker; CI is green; CSP nonce works; sign-in skeleton works |
| M1 Feasibility spikes | Foundations & feasibility | M0 | Spike reports; creator's G1/G2 decisions and confirmed Q-01 targets recorded in the PRD |
| M2 Core collection & sync | Tonaris v1 product | M1 | AC-03–AC-05, AC-08, AC-14–AC-17, AC-33–AC-35 |
| M3 Capture & matching | Tonaris v1 product | M1, M2 | AC-06, AC-07, AC-09, AC-10, AC-18, AC-19 |
| M4 Custom fields | Tonaris v1 product | M2 | AC-11–AC-13 |
| M5 Trash, deletion & capacity | Tonaris v1 product | M2, M4 | AC-27–AC-29, AC-31, AC-32 |
| M6 Search | Tonaris v1 product | M2 | AC-25 (owned part) |
| M7 Sharing & guest pages | Tonaris v1 product | M5, M6 | AC-20–AC-24, AC-26, AC-30, AC-38, AC-25 (shared part) |
| M8 Accounts & admission | Tonaris v1 product | M0 | AC-01, AC-02, AC-39, AC-40 |
| M9 MCP | Tonaris v1 product | M1, M3, M4, M5, M7 | AC-36, AC-37 |
| M10 Data export | Tonaris v1 product | M4, M5 | AC-41 |
| M11 Hardening & acceptance | v1 acceptance | M2–M10 | AC-42–AC-46; every AC walked through; pending approvals recorded |

## Issues

Key: **Type · Capability/Gate · Area**. "Blocked by" refers to the keys in these tables.

### M0 Foundations

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M0-01 | Bun workspace skeleton (apps/web, apps/api, packages/*, tooling) | Chore · infra | TS-05, TS-07 | — |
| M0-02 | Lint, format, typecheck: oxlint type-aware, oxfmt, tsgo | Chore · infra | TS stack review, TS-124 | M0-01 |
| M0-03 | Local dev: native Postgres 18 + Mailpit; one `bun dev` for web + api | Chore · infra | TS-06 | M0-01 |
| M0-04 | Initialize OpenSpec: config.yaml context, x-linear convention | Chore · docs | TS-132, TS-133 | M0-01 |
| M0-05 | Database layer: Drizzle 1.0 RC + postgres.js, migration workflow, base tables | Chore · infra | TS-11, TS-17 | M0-03 |
| M0-06 | Standalone Elysia API skeleton: /v1, health, RFC 9457 errors, OpenAPI, Eden type export | Chore · api | TS-01, TS-04, TS-09, TS-29 | M0-01 |
| M0-07 | Web skeleton: TanStack Start, shadcn on Base UI, dark tokens, app shell | Design · web | DS-10–DS-20, DS-30; TS-03 | M0-01 |
| M0-08 | Domain foundations: normalize() with parity fixtures, outcome vocabulary, principals and policies | Chore · sync-and-conflicts · domain | TS-02, TS-12, TS-27, TS-30 | M0-01 |
| M0-09 | Sign-in skeleton: Better Auth email OTP, cross-subdomain session, creator bootstrap | Feature · accounts · api | FR-11.1; TS-70, TS-71, TS-08 | M0-05, M0-06, M0-07 |
| M0-10 | Security baseline: CSP with nonce, CORS allowlist, CSRF origin checks | Chore · infra | Q-06; TS-101, TS-102 | M0-06, M0-07 |
| M0-11 | CI pipeline: lint, format, typecheck, bun test with Postgres, builds, openspec validate | Chore · infra | TS-124 | M0-02, M0-04, M0-05 |
| M0-12 | Host-agnostic production builds: Dockerfiles for web and api, pre-deploy migrate, health checks | Chore · infra | Q-08; TS-110 | M0-06, M0-07 |

### M1 Feasibility spikes

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M1-01 | Workload generator: 5,000 owned + 5,000 shared albums | Chore · infra | TS-120 | M0-05 |
| M1-02 | G1 spike: MusicBrainz identification chain on ~150 real albums | Spike · G1 · api | G1; TS-41 | M0-01 |
| M1-03 | G1 spike: Spotify client credentials in dev mode; UPC and track→album | Spike · G1 · api | G1; TS-41 | M0-01 |
| M1-04 | G1 spike: Apple iTunes Lookup hints + strict MusicBrainz match accuracy | Spike · G1 · api | G1; TS-41 | M1-02 |
| M1-05 | G1: terms review of Spotify API use (III.5) and iTunes Lookup; decision memo | Spike · G1 · docs | G1, FR-08.8, FR-10.9 | — |
| M1-06 | G2 spike: edition-matching evidence corpus and rules | Spike · G2 · domain | G2; TS-44 | M1-02 |
| M1-07 | Elysia 2 viability: Eden v2, OpenAPI generation, SSE on Bun | Spike · api | TS-04, TS-09 | M0-06 |
| M1-08 | Sync prototype: envelope, field CAS, idempotency, change_log, SSE, TanStack DB collection | Spike · sync-and-conflicts · domain | FR-09, FR-13; TS-20–TS-28 | M0-05, M0-08, M1-07 |
| M1-09 | Measure sync prototype against provisional Q-01 targets | Spike · sync-and-conflicts · web | Q-01; TS-120 | M1-01, M1-08 |
| M1-10 | G3 spike: MCP SDK v2 + Better Auth OAuth (CIMD/DCR) in Claude web, ChatGPT web, Codex | Spike · G3 · api | G3, FR-10.1–FR-10.3; TS-60, TS-61, TS-123 | M0-09 |
| M1-11 | G3 spike: verifiable approval round trip in all three clients; ChatGPT write-action plan check | Spike · G3 · api | FR-10.6; TS-64 | M1-10 |
| M1-12 | Spike: invite-only admission gate in one transaction with Better Auth | Spike · admission · api | FR-11.2; TS-71 | M0-09 |
| M1-13 | Record G1/G2 decisions and confirmed Q-01 targets in PRD and tech spec | Chore · docs | G1, G2, Q-01 | M1-04, M1-05, M1-06, M1-09, M1-11 |

### M2 Core collection & sync

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M2-01 | Containers: create, rename, nest, move with cycle checks and sibling uniqueness | Feature · collection-hierarchy · domain | FR-01.1–FR-01.5, X-06; TS-11, TS-31 | M1-13 |
| M2-02 | Albums, memberships, Unsorted: shared metadata, one entry per list, retention | Feature · album-records · domain | FR-01.6–FR-01.10; TS-11, TS-13 | M1-13 |
| M2-03 | Production mutation endpoint: idempotency, field CAS, conflict and batch outcomes | Feature · sync-and-conflicts · api | FR-09.4, FR-13.3–FR-13.5; TS-20–TS-22, TS-25 | M1-13 |
| M2-04 | Bootstrap + SSE change stream: reconnect, reset, leader tab | Feature · sync-and-conflicts · api | FR-09.1–FR-09.3; TS-23, TS-24, TS-28 | M2-03 |
| M2-05 | Client store: TanStack DB collections, IndexedDB outbox, unconfirmed reconciliation | Feature · sync-and-conflicts · web | FR-09.3, FR-13.5; TS-22, TS-24 | M2-04 |
| M2-06 | Save-state UI: item markers, SyncIndicator, Activity, conflict view | Design · sync-and-conflicts · web | FR-09.3–FR-09.4; DS-80–DS-83 | M2-05 |
| M2-07 | Batch outcome report and error presentation | Design · sync-and-conflicts · web | FR-13.1–FR-13.4; DS-84, DS-107, DS-108 | M2-06 |
| M2-08 | App shell: sidebar tree, breadcrumbs, routes, keyboard navigation | Feature · collection-hierarchy · web | FR-01.3; DS-27, DS-30–DS-32, DS-78 | M2-05 |
| M2-09 | Collection views: Rows + Grid layouts with virtualization | Feature · views-and-ordering · web | FR-05; DS-21–DS-23, DS-40, DS-41 | M2-08 |
| M2-10 | Sorting, grouping, chronology display, view options, account defaults | Feature · views-and-ordering · web | FR-05.1, FR-05.5–FR-05.10, FR-11.7–FR-11.8; DS-24, DS-42–DS-44, DS-49, DS-94 | M2-09 |
| M2-11 | Personal manual order: fractional keys, keyboard rearranging, moves between containers | Feature · views-and-ordering · web | FR-05.2–FR-05.4, FR-01.4–FR-01.5; TS-16; DS-49, DS-51 | M2-09 |
| M2-12 | Viewing and editing modes | Feature · views-and-ordering · web | FR-04; DS-45 | M2-08 |
| M2-13 | Album inspector and manual entry form, with required info and validation | Feature · album-records · web | FR-02.4, FR-02.6, FR-03.1–FR-03.2; DS-46, DS-47 | M2-02, M2-08 |

### M3 Capture & matching

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M3-01 | Link parsing and canonicalization for all three services | Feature · album-capture · domain | FR-02.1, FR-02.3, FR-06.4; TS-40 | M1-13 |
| M3-02 | safeFetch: SSRF-guarded fetcher for short links and outbound calls | Chore · album-capture · api | Q-05; TS-103 | — |
| M3-03 | MusicBrainz client: 1 req/s global queue and cache | Feature · album-capture · api | TS-41, TS-90 | M3-02 |
| M3-04 | Identification resolver chain (steps 0–5) | Feature · album-capture · api | FR-02.1–FR-02.3, FR-06.7; TS-41 | M3-01, M3-03 |
| M3-05 | Enrichment: fill gaps only, provenance, classification mapping, chronology | Feature · album-capture · domain | FR-02.7–FR-02.8, FR-03.3; TS-15, TS-42, TS-45, TS-46 | M3-04 |
| M3-06 | Edition matching and uncertain-match confirmation, including re-addition from Trash | Feature · edition-matching · domain | FR-02.9–FR-02.10, FR-14.4; TS-26, TS-44 | M3-04 |
| M3-07 | Capture UX: paste anywhere, capture popover, placeholder rows, outcome toasts, batch panel | Design · album-capture · web | FR-02.1–FR-02.5, FR-02.11; DS-48 | M3-05, M3-06 |
| M3-08 | Service links: one per service, capture conflicts, manual editing | Feature · service-links · domain | FR-06.2–FR-06.4 | M3-01 |
| M3-09 | Open-in-service chooser with app/web fallback | Feature · service-links · web | FR-06.5–FR-06.6; TS-43; DS-25 | M3-08 |
| M3-10 | Artwork: Cover Art Archive + signed image proxy + fallback tiles | Feature · album-records · api | FR-03.4; TS-103; DS-23 | M3-02 |

### M4 Custom fields

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M4-01 | Field definitions: create, rename, types, name uniqueness | Feature · custom-fields · domain | FR-03.6, FR-03.9, FR-03.11; TS-11 | M2-02 |
| M4-02 | Per-album usage and value editors (applied-empty vs unused) | Feature · custom-fields · web | FR-03.7, FR-03.8, FR-03.10; DS-26 | M4-01 |
| M4-03 | Type changes and option lifecycle (add, rename, remove used with confirmation) | Feature · custom-fields · domain | FR-03.12–FR-03.17; TS-14 | M4-01 |
| M4-04 | Permanent field deletion with confirmation | Feature · custom-fields · domain | FR-03.18, X-09 | M4-01 |
| M4-05 | Settings → Custom fields screen | Design · custom-fields · web | DS-60 | M4-03, M4-04 |
| M4-06 | Folder and list descriptions | Feature · collection-hierarchy · web | FR-03.5; DS-41 | M2-01 |

### M5 Trash, deletion & capacity

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M5-01 | Trash model and units; folder deletion (confirmed) and list deletion (undo) | Feature · trash-and-recovery · domain | FR-01.11–FR-01.13; TS-13; DS-50 | M2-01, M2-02 |
| M5-02 | Container recovery: active albums only, skip report, destination and name-collision prompts | Feature · trash-and-recovery · domain | FR-01.14–FR-01.16; TS-26; DS-56 | M5-01 |
| M5-03 | Album deletion, restore, and same-edition conflict | Feature · trash-and-recovery · domain | FR-14.1–FR-14.3; DS-50, DS-56 | M5-01 |
| M5-04 | Expiry sweep job and early permanent removal / Empty Trash | Feature · trash-and-recovery · api | FR-01.17–FR-01.18, FR-14.5; TS-91; DS-57 | M5-01 |
| M5-05 | Trash view UI | Design · trash-and-recovery · web | FR-01.12; DS-55 | M5-02, M5-03 |
| M5-06 | Capacity counting, limits, and usage meter | Feature · capacity-limits · domain | FR-15; TS-18; DS-98 | M2-02 |

### M6 Search

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M6-01 | Client-side search index and command palette (owned content) | Feature · search · web | FR-12.1, FR-12.2, FR-12.4, FR-12.5; TS-50; DS-75 | M2-05 |
| M6-02 | Server search (pg_trgm) for API and MCP, with parity fixtures | Feature · search · api | FR-12.1, FR-12.6; TS-12, TS-50 | M2-02 |
| M6-03 | Palette commands and shortcut reference | Design · search · web | DS-75, DS-78 | M6-01 |

### M7 Sharing & guest pages

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M7-01 | Access resolution: grants, link tokens, inheritance, Trash suspension | Feature · sharing · domain | FR-07.8–FR-07.10, FR-07.12; TS-31–TS-33 | M5-01 |
| M7-02 | Sharing dialog with disclosures and display-name guard | Feature · sharing · web | FR-07.1–FR-07.4, FR-07.14, FR-11.3; DS-65; TS-34 | M7-01 |
| M7-03 | Invitations: delivery, inbox, accept/decline | Feature · sharing · api | FR-07.5–FR-07.6; DS-66; TS-72 | M7-01 |
| M7-04 | Leave, revoke, and link disable/regenerate | Feature · sharing · domain | FR-07.7, FR-07.15–FR-07.16 | M7-03 |
| M7-05 | Shared with me and saved link references | Feature · sharing · web | FR-07.13; DS-67, DS-68 | M7-01 |
| M7-06 | Viewer chrome and personal views of shared content | Feature · sharing · web | FR-07.17, FR-05.2; DS-70 | M7-05 |
| M7-07 | Guest pages: SSR, temporary presentation, live invalidation | Feature · sharing · web | FR-07.11, FR-11.9; DS-72; TS-23 | M7-01 |
| M7-08 | SharingImpact previews on moves and recovery | Design · sharing · web | FR-07.9, FR-07.14; DS-69 | M7-01 |
| M7-09 | Shared content in search | Feature · search · web | FR-12.3; TS-50 | M6-01, M7-05 |

### M8 Accounts & admission

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M8-01 | Choose email provider and build templates | Chore · accounts · api | TS-72 | M0-09 |
| M8-02 | Admission admin: issue, revoke, pause, statuses, 14-day expiry | Feature · admission · web | FR-11.6; TS-71; DS-100 | M1-12, M8-01 |
| M8-03 | Admission landing and registration | Feature · admission · web | FR-11.2; DS-91 | M8-02 |
| M8-04 | Settings: profile, display name, preferences | Feature · accounts · web | FR-11.3, FR-11.7, FR-11.13; DS-92–DS-94 | M0-09 |
| M8-05 | Sign-in email change with dual verification | Feature · accounts · api | FR-11.4; TS-73; DS-93 | M8-01 |
| M8-06 | Creator-assisted recovery: admin action and help page | Feature · accounts · web | FR-11.5; TS-73; DS-93, DS-100 | M8-05 |
| M8-07 | Account deletion: typed email, export offer, deletion job | Feature · accounts · api | FR-11.10–FR-11.11; TS-74; DS-97 | M8-04 |

### M9 MCP

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M9-01 | MCP server + OAuth AS + consent screen + Settings → Connections | Feature · mcp-access · api | FR-10.1–FR-10.3; TS-60–TS-62; DS-85, DS-86 | M1-11 |
| M9-02 | Read tools: overview, containers, albums, search, Trash, fields, shared | Feature · mcp-access · api | FR-10.2, FR-10.9; TS-63, TS-65 | M9-01, M6-02 |
| M9-03 | Write tools for ordinary operations, with idempotency and outcomes | Feature · mcp-access · api | FR-10.4, FR-10.5; TS-63 | M9-01 |
| M9-04 | Gated operations: verifiable approvals and approval page | Feature · mcp-access · web | FR-10.6; TS-64; DS-87 | M9-03, M5-01 |
| M9-05 | Trash recovery via MCP | Feature · mcp-access · api | FR-10.7 | M9-03, M5-02 |
| M9-06 | Abuse limits and contract tests per client | Chore · mcp-access · api | FR-15.4; TS-18, TS-66, TS-123 | M9-04 |
| M9-07 | Connection setup instructions for Claude web, ChatGPT web, Codex | Design · mcp-access · docs | FR-10.1; DS-86 | M9-01 |

### M10 Data export

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M10-01 | Export builder: JSON v1 + JSON Schema | Feature · data-export · domain | FR-08.3–FR-08.5; TS-81 | M4-01, M5-01 |
| M10-02 | Markdown rendering and README | Feature · data-export · domain | FR-08.2; TS-82 | M10-01 |
| M10-03 | Export endpoint (snapshot, streamed ZIP, limits) and Settings → Data UI | Feature · data-export · web | FR-08.1, FR-08.6; TS-80; DS-96 | M10-02 |
| M10-04 | Export validator tooling and tests | Chore · data-export · infra | AC-41 | M10-01 |

### M11 Hardening & acceptance

| Key | Title | Labels | Trace | Blocked by |
| --- | --- | --- | --- | --- |
| M11-01 | Observability: Sentry (EU), structured logs, uptime checks | Chore · infra | TS-115 | M0-12 |
| M11-02 | Performance verification against confirmed Q-01 targets | Chore · infra | Q-01, AC-43; TS-120 | M1-13 |
| M11-03 | Accessibility audit: keyboard, VoiceOver, NVDA, TalkBack | Chore · web | Q-02, AC-42; TS-122 | — |
| M11-04 | Browser matrix verification | Chore · web | Q-03, AC-42; TS-122 | — |
| M11-05 | Security: adversarial fixtures and threat-model review | Chore · infra | Q-05, Q-06, AC-45; TS-100, TS-106 | — |
| M11-06 | Backup tooling, restore drill, and revocation-ledger reconciliation | Chore · infra | Q-04, AC-44; TS-112, TS-113 | M11-07 |
| M11-07 | Creator decision: backup objectives and deletion disclosure wording | Chore · docs | Q-04; TS-114 | — |
| M11-08 | Acceptance walkthrough AC-01–AC-46; record pending approvals in the PRD | Chore · docs | Section 7 of the PRD | M11-02, M11-03, M11-04, M11-05, M11-06 |
