# Design

## Context

- **Albums already store `search_title_key` and `search_artist_key`.** Containers store only `name_key`. MCP's `search` uses a `LIKE` scan over the album keys, ordered by artist and title.
- **The app's ranking** (TON-61) is in `apps/web/src/features/search/search-index.ts`, over `searchTier()` from `packages/domain`.
- **Migrations are SQL from drizzle-kit,** applied in one transaction by `migrateDatabase()`. Nothing runs TypeScript during a migration yet.
- **Tests use a fresh schema per test in `tonaris_test`,** with `search_path` set to that schema only.

## Goals / Non-Goals

**Goals:**
- one server search for the API and MCP, with the app's scope, matching, order and locations;
- a fixture that proves parity;
- the 300 ms target.

**Non-Goals:**
- shared content (M7, TON-72);
- MCP's full search tool, with folders and lists (TON-81);
- highlighting on the server: clients compute it with `matchRange()`.

## Decisions

### 1. The column and its fill-in

- **The migration:**
  - adds `search_name_key text NOT NULL DEFAULT ''`, then drops the default, so writers must set it;
  - creates the extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
  - adds three GIN indexes with `public.gin_trgm_ops`.
- **The fill-in:** after the SQL migrations, `migrateDatabase()` sets `search_name_key = searchKey(name)` for rows whose key is `''`, in chunks. It's a no-op on a migrated database, apart from the rare name whose key really is empty.
- **Writers:** `insertContainer` and `updateContainer` set the key beside `name_key`. So do the tools and fixtures that insert containers directly.
- **Alternative:** compute the key in SQL with `unaccent` and `lower`. Rejected by TS-12: their tables differ from the JavaScript ones.

### 2. The extension and the tests

- **Why `public`:** test schemas are dropped with `cascade`, which would drop an extension living in one of them, and other schemas' connections don't see it. So the extension lives in `public`, and indexes name the opclass as `public.gin_trgm_ops`. The `LIKE` operator itself is `pg_catalog`'s, so queries use the index whatever the `search_path`.
- **Races:** test databases create the extension before migrating, and tolerate a concurrent create.

### 3. The query

- **Matching:**
  - Containers match on `search_name_key LIKE '%key%'`; albums on their title or artist key, the same way. `%`, `_` and `\` in the query are escaped.
  - Both queries are scoped to the owner and to `trashed_at IS NULL`.
  - The GIN indexes serve queries of 3 or more characters. The planner takes the owner index for shorter ones, which is fine at 5,000 rows (TS-50).
- **Ranking in TypeScript:**
  - The matched rows' keys are ranked by `rankNames` and `rankAlbums` from `packages/domain`, which the web index also uses. Then the first `limit` of each group are kept, with each group's total.
  - SQL ranking would need a word-boundary rule matching JavaScript's `\p{L}\p{N}`, which Postgres's locale classes don't guarantee.
- **Locations:**
  - One query loads the owner's active folders and lists (at most 2,000) to build paths.
  - One more loads the shown albums' memberships in active lists.
  - An album's lists are sorted by path key, so the first is the app's location.

### 4. The API

- **`GET /v1/search`:**
  - `q`: 1 to 200 characters; a blank query after trimming is `422 validation_failed`, as any invalid input is.
  - `limit`: 1 to 100, default 8.
- **The answer:** `{folders, lists, albums}`, each `{total, items}`.
  - Container items: `{id, kind, name, parentId, location: string[]}`.
  - Album items: the album's metadata without artwork, plus `lists: [{id, location}]`.
  - A `location` is the names from the top of the collection down to the place itself: `[]` for a top-level container, `["Metal", "Doom"]` for an album in Doom inside Metal.
- **MCP's `search` tool** keeps its input and output and takes its albums from the same function.

### 5. Parity

- **`packages/domain/fixtures/search.json`:** containers with parents, albums with lists, content in Trash, a description that must not match, and queries with expected names in order, totals and locations.
- **The web test** builds the index from the active part. **The db test** inserts everything, with the Trash part trashed. Both compare against the same expectations.
- **The db test also runs `normalize.json`'s search cases** against the server, as TS-12 asks.

## Risks / Trade-offs

- **[A short query matching most albums ships thousands of keys to rank]** → 5,000 short rows are well within the budget. The perf check measures one-letter queries.
- **[The fill-in runs outside the migration transaction]** → It is idempotent and runs on every migrate, so an interrupted run completes on the next.

## Migration Plan

- `bun run db:migrate` applies the SQL and fills the keys.
- Production's Postgres must allow `CREATE EXTENSION pg_trgm`. It is a trusted extension, so the database owner can create it.
- **Rollback:** drop the indexes and the column. The extension can stay.
