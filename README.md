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

## Working conventions

- **IDs are stable.** Linear issues and OpenSpec changes cite the rule IDs they implement, such as `FR-07.9`, `DS-12`, or `TS-08`.
- **Change promises in the requirements first.** When product behavior changes, update the requirements before the design or tech spec, and add a change-log entry.
- **OpenSpec grows change by change.** Each Linear issue that changes behavior becomes one OpenSpec change, linked through `x-linear` in its `.openspec.yaml`. Capability specs build up as changes are archived; the requirements are not bulk-converted. See the tech spec's delivery section.

Next steps: run the G1–G3 feasibility spikes, then set up Linear projects following the tech spec's delivery plan.
