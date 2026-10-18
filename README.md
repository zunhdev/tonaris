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
web       → domain, ui
api       → domain, db, providers
db        → domain
providers → domain
tooling   → domain, db, providers
```

Installs are *isolated*, so a package can import only what it declares; an undeclared workspace import fails at runtime. `bun run check:workspace` enforces the allowed edges and exact version pinning (TS-07).

## Development

Requires Bun 1.4.3 (see `.bun-version`).

```sh
bun install --frozen-lockfile   # install exactly what bun.lock records
bun run check                   # everything below, in order; run before opening a PR
bun run format:check            # oxfmt (bun run format to fix)
bun run lint                    # oxlint with type-aware rules (bun run lint:fix to fix)
bun run typecheck               # TypeScript 7 `tsc --noEmit` in every package
bun run check:workspace         # layering and pinning rules
bun test                        # all tests
```

Tooling: oxlint (`.oxlintrc.json`), oxfmt (`.oxfmtrc.json`; Markdown is not auto-formatted), TypeScript 7 with a shared `tsconfig.base.json` that each package extends. Recommended editor extensions are listed in `.vscode/extensions.json`.

New dependencies are added with `bun add <name>` inside the package that uses them; `bunfig.toml` makes Bun write the exact version.

### Running locally

Postgres and Mailpit run natively on your machine, not in Docker; Docker is only for deployment builds (TS-06). You need:

- **Postgres 18** on `localhost:5432` with the `pg_trgm` extension available, for example through [DBngin](https://dbngin.com);
- **Mailpit**, which captures outgoing email: `brew install mailpit`, then `brew services start mailpit`.

```sh
bun dev             # web and api together; each reloads when you save
bun run mail:test   # send one email to Mailpit
```

| Service | Address |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:3001, health check at `/healthz` |
| Postgres 18 | `localhost:5432` |
| Mailpit | inbox at http://localhost:8025, SMTP on `localhost:1025` |

- Both apps are placeholders until the API and web skeletons land, and nothing connects to Postgres yet.
- In watch mode, an app that crashes waits for a file change instead of exiting; stop everything with Ctrl+C.

## Working conventions

- **IDs are stable.** Linear issues and OpenSpec changes cite the rule IDs they implement, such as `FR-07.9`, `DS-12`, or `TS-08`.
- **Change promises in the requirements first.** When product behavior changes, update the requirements before the design or tech spec, and add a change-log entry.
- **OpenSpec grows change by change.** Each Linear issue that changes behavior becomes one OpenSpec change, linked through `x-linear` in its `.openspec.yaml`. Capability specs build up as changes are archived; the requirements are not bulk-converted. See the tech spec's delivery section.

Next steps: run the G1–G3 feasibility spikes, then set up Linear projects following the tech spec's delivery plan.
