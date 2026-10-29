# Design

## Context

- **`searchCollection()`** (TON-62) searches the owner's active containers and albums with pg_trgm indexes, and ranks in TypeScript with the app's `rankNames` and `rankAlbums`.
  - It feeds `GET /v1/search` and MCP's `search` (albums).
- **The palette** (TON-61) searches a local index of the person's own collections.
- **`readableContainers()`** (TON-64) gives what a person reads through sharing, with the sources; walking down from them covers active containers only.
- **TS-50's plan:** a per-root index in the bootstrap, refreshed on invalidation.

## Goals / Non-Goals

**Goals:**
- shared results from the server, in the API, MCP and the palette;
- accessible locations only;
- owners named.

**Non-Goals:**
- **Shared results offline.** The creator chose the server over the per-root index: owned search stays local and instant; shared search is online-only and always current.
- **MCP's folder and list search** (TON-81).

## Decisions

### 1. The query

**`searchCollection(db, {ownerId, query, limit})`** also runs `readableContainers(db, person)`. With nothing readable, the `shared` groups are empty and nothing more is read.

**Otherwise, in parallel:**
- the readable containers' rows and owners' display names;
- those whose `search_name_key` matches;
- the active albums in readable lists whose title or artist key matches, distinct.

**Each shared result:**
- **its shared root:** the topmost readable container above it or itself. A container reached through two nested shares is located from the higher one, the longest path the person can see;
- **its location:** names from that root down to its parent (for a container) or to each list (for an album), computed over the readable rows only, so a private ancestor can't appear;
- **`parentId`:** null when the parent isn't readable;
- **an album's `lists`:** only readable ones, each with its root.

Ranking and limits are the owned groups'.

### 2. The schemas

`searchResultsSchema` gains `shared` with three groups:
- **containers:** `searchContainerSchema` plus `rootId` and `owner: {id, displayName}`;
- **albums:** `searchAlbumSchema` plus `owner`, with `rootId` on each list.

The owned groups don't change. OpenAPI changes in a response only, so no request diff.

### 3. MCP

**`search`:**
- **Results:** the person's albums first, then shared albums, up to `limit` together.
- **`sharedBy`:** the owner's display name for a shared album (or "a Tonaris member"), else null.
- **Description:** "and albums shared with them".

### 4. The palette

**`useSharedResults(text)`:**
- asks `GET /v1/search?q=&limit=100` 150 ms after the text last changed, while online, and keeps only `shared`;
- an answer to older text is dropped.

**The "Shared with me" group:**
- comes after Albums, before Commands;
- folders, then lists, then albums, collapsed to 8 with "Show all";
- **each row:** an icon or artwork, the highlighted name, and "Shared by {name} · {path}".

**Opening:**
- a container opens `/shared/{rootId}`, with `?c={id}` below the root;
- an album opens its first list there. ⌘Enter does the same: shared albums have no page of their own.

**"No results"** shows once the shared answer is in, or offline. Offline, the group is a line saying shared content isn't searched.

## Risks / Trade-offs

- **[The palette asks for the person's own matches too]** → The server answers both, and the owned part is dropped. At 5,000 albums the slowest owned query was 27 ms (TS-50). An optional scope parameter can come later, if needed.
- **[Readable sets are large for heavy sharers]** → `readableContainers` is one recursive query. Albums are found with one join on memberships of readable lists, using the trigram indexes.

## Migration Plan

None.
