# Tasks

## 1. Domain

- [x] 1.1 Move the app's ranking into `rankNames` and `rankAlbums` in `packages/domain`, and use them in the web index (design decision 3). Verify with the existing index tests.
- [x] 1.2 Add the search response schemas and `fixtures/search.json` (design decisions 4 and 5). Run the fixture in the web index's tests.

## 2. Database

- [x] 2.1 Add `search_name_key`, the extension and the GIN indexes in a migration, the fill-in in `migrateDatabase`, the key in container writes, and the extension in test databases (design decisions 1 and 2). Verify with a db test: a container inserted without its key is filled, and `EXPLAIN` uses the trigram index.
- [x] 2.2 Add `searchCollection()` (design decision 3). Verify with db tests:
  - the parity fixture, Trash included;
  - `normalize.json`'s search cases;
  - another account's content left out;
  - `%` and `_` taken literally.

## 3. API and MCP

- [x] 3.1 Add `GET /v1/search`, and regenerate the OpenAPI document (design decision 4). Verify with API tests: the signed-out 401, a blank query's 400, the limit and totals.
- [x] 3.2 Back MCP's `search` tool with `searchCollection()`. Verify with the MCP tests, ordering included.

## 4. Measure and document

- [x] 4.1 Measure server search on the workload account (5,000 albums) in the local database: short and long queries, one run each. Record the numbers in TS-50. Verify they are within 300 ms.
- [x] 4.2 Record TS-11's `containers` row, TS-50 and the API as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request-schema comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
