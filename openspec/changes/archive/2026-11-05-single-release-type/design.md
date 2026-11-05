# Design

## Context

The release types live in one list, `releaseTypes` in `packages/domain/src/albums.ts`. The domain schema, the database column and its check constraint, the API's and MCP's enums, and the web app's type pickers all derive from it. Grouping has its own list, `releaseGroups`, with `groupNames` for labels. MusicBrainz's types are mapped by `classify()` in `packages/providers/src/album-facts.ts`.

## Goals / Non-Goals

**Goals:**
- Single everywhere EP is, from the same two lists, so nothing hand-lists the types again.

**Non-Goals:**
- Reclassifying singles saved earlier (the creator chose to leave them).
- Step 4's matching rule: which album types a store's hints may match is about matching accuracy, not release types, and stays as TS-41 says (singles for Apple's " - Single" and for hints with a track count).

## Decisions

- **`single` sits after `ep` in `releaseTypes`,** so the pickers read Album, EP, Single, Compilation, then Unknown, and after `ep` in `releaseGroups`, as the creator chose for the group order.
- **`classify()` treats Single as it treats EP:** its own type unless Compilation is among the secondary types, and `is_live` from Live, true or false.
- **The check constraint is replaced by a generated migration** (`drizzle-kit generate`), as the schema derives it from `releaseTypes`. Widening it needs no data change.
- **The API changes in place,** at the creator's direction: no one uses it yet. oasdiff matches `POST /v1/mutations`' inline request variants by content, so widening `album.create`'s, `album.update`'s and `album.capture`'s `releaseType` reads as removing them. The exact lines CI reports go into `oasdiff-ignore.txt` for this change. The response enums' new value is a warning, as `oasdiff-levels.txt` already says. TON-131's entries match nothing now that its change is on main, and an entry left over could hide a real removal that happens to read the same, so they go.

## Risks / Trade-offs

- **Clients that list the types themselves** would miss `single` → none exist outside this repository, and the web app's pickers and groups derive from the shared lists.
- **A single's earlier capture keeps no type** → it shows under Unclassified until set by hand, as the creator chose.
