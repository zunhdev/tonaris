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
bun test                        # run all tests
bun run check:workspace         # layering and pinning rules
```

New dependencies are added with `bun add <name>` inside the package that uses them; `bunfig.toml` makes Bun write the exact version.

## Working conventions

- **IDs are stable.** Linear issues and OpenSpec changes cite the rule IDs they implement, such as `FR-07.9`, `DS-12`, or `TS-08`.
- **Change promises in the requirements first.** When product behavior changes, update the requirements before the design or tech spec, and add a change-log entry.
- **OpenSpec grows change by change.** Each Linear issue that changes behavior becomes one OpenSpec change, linked through `x-linear` in its `.openspec.yaml`. Capability specs build up as changes are archived; the requirements are not bulk-converted. See the tech spec's delivery section.

Next steps: run the G1–G3 feasibility spikes, then set up Linear projects following the tech spec's delivery plan.
