# Tonaris

A personal workspace for saving, organizing, annotating, and revisiting music albums across streaming services. It offers read-only sharing, AI collection management through MCP, and a full export of your own data.

## Project status

Tonaris is in specification and feasibility planning; no application code exists yet. The first version will be a creator-hosted, invite-only web app. Desktop supports full collection management, while mobile browsers support browsing and search. Spotify, Apple Music, Qobuz, and MCP integrations still depend on access, policy, and compatibility validation (feasibility gates G1–G3).

## Documents

| Document | Purpose | IDs |
| --- | --- | --- |
| [Product requirements](docs/product-requirements.md) | Source of truth for behavior, scope, permissions, quality, and acceptance | `FR-NN.M`, `X-`, `Q-`, `AC-`, `G1`–`G3` |
| [Design spec](docs/design-spec.md) | Design system, information architecture, screens, and interaction flows | `DS-` |
| [Tech spec](docs/tech-spec.md) | Stack, architecture, data, sync, MCP, operations, verification, and delivery plan | `TS-` |
| [Audits](docs/audits/) | Dated requirement audits and the decisions taken in them | — |

## Repository layout

A Bun workspace (tech spec TS-05):

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/web` | `@tonaris/web` | TanStack Start web app: UI and server-rendered public pages. All data goes through the API. |
| `apps/api` | `@tonaris/api` | Standalone Elysia API service: `/v1` REST, sync stream, MCP, auth, jobs. |
| `packages/domain` | `@tonaris/domain` | Framework-free business logic: commands, queries, policies, schemas, normalization. |
| `packages/db` | `@tonaris/db` | Drizzle schema, migrations, repositories. |
| `packages/providers` | `@tonaris/providers` | Link parsing, MusicBrainz and Cover Art Archive clients, provider adapters. |
| `packages/ui` | `@tonaris/ui` | Design system: tokens, primitives, patterns. |
| `tooling` | `@tonaris/tooling` | Repository tooling: workspace checks, seeds, restore drill, export validator. |
| `docs` | — | Product requirements, design spec, tech spec, audits. |

Packages may depend only on these internal packages (TS-02):

```
web       → domain, ui; api for types only (its Eden client, TS-29)
api       → domain, db, providers
db        → domain
providers → domain
tooling   → domain, db, providers
```

Installs are *isolated*, so a package can import only what it declares; an undeclared workspace import fails at runtime. `bun run check:workspace` enforces the allowed edges and exact version pinning (TS-07). The web app's dependency on the API must be a devDependency, and oxlint rejects anything but `import type` from `@tonaris/api` (or any import of `@tonaris/db`) in `apps/web`. oxlint also keeps `packages/domain` free of frameworks, databases, and Node or Bun modules and globals, because the web app runs its normalization and schemas in the browser.

## Development

Requires Bun 1.4.3 (see `.bun-version`).

```sh
bun install --frozen-lockfile   # install exactly what bun.lock records
bun run check                   # everything below, in order; run before opening a PR
bun run format:check            # oxfmt (bun run format to fix)
bun run lint                    # oxlint with type-aware rules (bun run lint:fix to fix)
bun run typecheck               # TypeScript 7 `tsc --noEmit` in every package
bun run check:workspace         # layering and pinning rules
bun run check:specs             # openspec validate --all --strict
bun run db:check                # migrations match the schema (drizzle-kit check, no-diff generate)
bun run openapi:check           # the committed OpenAPI document matches the API routes
bun test                        # all tests; the integration tests need the local Postgres
bun run test:e2e                # Playwright browser tests of the web app (needs Node and Chromium)
```

Tooling: oxlint (`.oxlintrc.json`), oxfmt (`.oxfmtrc.json`; Markdown is not auto-formatted), TypeScript 7 with a shared `tsconfig.base.json` that each package extends. Recommended editor extensions are listed in `.vscode/extensions.json`.

New dependencies are added with `bun add <name>` inside the package that uses them; `bunfig.toml` makes Bun write the exact version.

The browser tests run Playwright's test runner, which needs Node 20.19 or later and Chromium: `bunx playwright install chromium` once. They build the web app and serve it with `vite preview` on port 3100.

### Running locally

Postgres and Mailpit run natively on your machine, not in Docker; Docker is only for deployment builds (TS-06). You need:

- **Postgres 18** on `localhost:5432` with the `pg_trgm` extension available, for example through [DBngin](https://dbngin.com);
- **Mailpit**, which captures outgoing email: `brew install mailpit`, then `brew services start mailpit`.

```sh
bun run db:create   # once: create the tonaris and tonaris_test databases
bun run db:migrate  # apply the committed migrations to tonaris
bun dev             # web and api together; each reloads when you save
bun run mail:test   # send one email to Mailpit
```

| Service | Address |
| --- | --- |
| Web app | http://localhost:3000: the workspace at `/c` (client-rendered), sign-in at `/sign-in` (server-rendered) |
| API | http://localhost:3001: `/v1/health`, the OpenAPI document at `/v1/openapi.json`, the host health check at `/healthz` |
| Postgres 18 | `localhost:5432`: database `tonaris` (`DATABASE_URL`), tests in `tonaris_test` (`TEST_DATABASE_URL`) |
| Mailpit | inbox at http://localhost:8025, SMTP on `localhost:1025` |

- The web app runs TanStack Start on Vite (`bun --bun vite dev`). The workspace shell and sign-in are placeholders until M2 and the sign-in work fill them in.
- The defaults connect as `postgres` without a password. Set `DATABASE_URL` or `TEST_DATABASE_URL` to use another server; production must set `DATABASE_URL`.
- Integration tests each run in a fresh, migrated schema of `tonaris_test` (`@tonaris/db/testing`), dropped afterwards.
- In watch mode, an app that crashes waits for a file change instead of exiting; stop everything with Ctrl+C.

### API contract

The API (`apps/api`, Elysia 2 beta) serves every resource under `/v1` (TS-09):

- **Errors** are RFC 9457 problems (`application/problem+json`) with `type: "about:blank"`, the status phrase as `title`, and a TS-27 `code` such as `not_found`, `validation_failed` or `internal_error`. Validation problems list each invalid input in `errors`. Unexpected errors are logged and answered without details.
- **OpenAPI 3.1** is generated from the routes' Zod schemas. After changing a route, run `bun run openapi:generate`, review the diff of `apps/api/openapi/v1.json` and commit it; `bun run openapi:check` fails while it is stale. Changes within `/v1` are additive only.
- **Clients:** the web app types its calls with Eden from the API's `type App` (`apps/web/src/api.ts`); native clients are generated from the OpenAPI document (TS-29).
- Routes that validate input declare `422: problemSchema` in their `response` map, so Eden and OpenAPI see the problem the API actually sends.

### Design system

`packages/ui` holds the design system (design spec DS-10 to DS-20):

- **Tokens** live in `src/styles/tokens.css`, in three layers: OKLCH primitives, the dark theme's semantic tokens (`bg.*`, `fg.*`, `border.*`, `accent.*`, `status.*`, `focus`), and the shadcn variables mapped onto them. Tailwind utilities are named after the semantic tokens: `bg-panel`, `text-fg-secondary`, `border-strong`, `bg-accent-fill`. Tailwind's default palette, text sizes and shadows are switched off.
- **Components use semantic tokens only.** `bun test` fails if a component or app file names a primitive, or if a token change breaks a DS-14 contrast target.
- **Components** are shadcn's, on Base UI: `bun run ui:add <name>` copies one into `packages/ui/src/components`, where it is restyled to DS-15 (24, 28 and 32px controls) and imported as `@tonaris/ui/components/<name>`.
- **Fonts:** Inter Variable is bundled into the app's own assets; no font CDN.

### Database changes

Migrations are generated from the Drizzle schema in `packages/db/src/schema/`, reviewed, and committed (TS-17):

1. Change the schema.
2. `bun run db:generate --name <what_changed>` writes `packages/db/migrations/<timestamp>_<name>/migration.sql` and a snapshot. Read the SQL; it is what production will run.
3. `bun run db:migrate` applies it locally; `bun test` runs the integration tests against it.
4. Commit the schema change and the migration together. `bun run db:check` fails while the schema has changes without a migration.

Notes:

- Don't edit a migration once it is merged; fix forward with a new one. Changes follow expand/contract, so a deploy never breaks the running version.
- `drizzle-kit push` is never used against shared databases.
- Generated migration files are excluded from oxfmt, so they stay exactly as drizzle-kit wrote them.

### Spec changes (OpenSpec)

Feature and Design issues each get exactly one [OpenSpec](https://github.com/Fission-AI/OpenSpec) change, in the same branch and PR as the code. Chore, Spike, and Bug issues get none.

In Claude Code:

1. `/opsx:propose <what to build>` creates `openspec/changes/<name>/` with a proposal, spec deltas, a design, and tasks. Add `x-linear: TON-<n>` to the change's `.openspec.yaml`, using exactly that key, because `--strict` rejects any other unknown key.
2. `/opsx:apply` implements the tasks.
3. Once review is done, `/opsx:archive` is the PR's last commit. It moves the change to `openspec/changes/archive/` and merges its deltas into `openspec/specs/`.

Notes:

- `openspec/config.yaml` gives every change the project context and per-artifact rules (TS-133).
- The CLI is pinned as a devDependency. Outside Claude Code, run it as `bunx openspec …`.
- In Claude Code, a SessionStart hook in `.claude/settings.json` puts `node_modules/.bin` on PATH, so the generated commands and skills can call `openspec` directly. That needs Node 20.19 or later on PATH; `bun run check:specs` works without Node.
- After upgrading `@fission-ai/openspec`, run `bunx openspec update` and commit the regenerated `.claude/commands/opsx/` and `.claude/skills/openspec-*` files.

## Working conventions

- **IDs are stable.** Linear issues and OpenSpec changes cite the rule IDs they implement, such as `FR-07.9`, `DS-12`, or `TS-08`.
- **Change promises in the requirements first.** When product behavior changes, update the requirements before the design or tech spec, and add a change-log entry.
- **OpenSpec grows change by change.** Capability specs in `openspec/specs/` build up as changes are archived; the requirements are not bulk-converted. See [Spec changes](#spec-changes-openspec) and the tech spec's delivery section (TS-132).

Next steps: run the G1–G3 feasibility spikes, then set up Linear projects following the tech spec's delivery plan.
