# Proposal

Linear: TON-62 (Feature). Implements FR-12.1, FR-12.4 and FR-12.5 on the server, and X-02's search parity between app and MCP. Tech: TS-12, TS-50. Done when the parity fixtures pass on client and server, and server time stays within 300 ms on the reference workload.

## Why

TON-61's search runs only in the browser. MCP and future API clients need the same search on the server, with the same scope, fields, matching and order (FR-12.1, X-02). Today MCP's `search` tool matches albums only and orders them differently.

## What Changes

- **Stored container search keys:** `containers.search_name_key`, written with `name_key` on every create and rename. Existing rows are filled by the migrate command, since keys are computed in TypeScript, not SQL (TS-12).
- **pg_trgm GIN indexes** on `albums.search_title_key`, `albums.search_artist_key` and `containers.search_name_key` (TS-50).
- **`GET /v1/search?q=&limit=`:** the signed-in account's active folders, lists and albums matching the query.
  - Each group has its total and its first `limit` results (8 by default, at most 100), ordered as the app orders them.
  - Each result has its location: a container's folder path; an album's lists with their paths, or none for Unsorted.
  - Trash and other accounts' content never appear.
- **Shared ranking:** the app's ordering moves to `packages/domain` (`rankNames`, `rankAlbums`), and the client and the server both use it.
- **One parity fixture,** `packages/domain/fixtures/search.json`: a small collection, with content in Trash, and queries with their expected groups, order and locations. The web index and the server search both run it. The server also runs `normalize.json`'s search cases.
- **MCP's `search` tool** uses the server search, so its albums come in the app's order. Folders and lists join it with TON-81.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search`: gains server search with parity, its scope, and its time target.

## Impact

- **`packages/db`:**
  - a migration (the pg_trgm extension, the new column, three GIN indexes) and the key fill-in in `migrateDatabase`;
  - `searchCollection()`;
  - container writes;
  - test databases ensure the extension.
- **`packages/domain`:** the ranking functions, the response schema, and the fixture.
- **`apps/api`:** the route, the regenerated OpenAPI document (a new path only), and MCP's `search` tool.
- **`apps/web`:** the index uses the shared ranking and runs the fixture.
- **Platform requirement:** Postgres with pg_trgm, already listed (TS-50).
