# Design

## Context

- **Existing tables:** `share_links (id, container_id, token_hash bytea unique, revoked_at)`, with one active link per container; `share_grants (id, container_id, grantee_id, status, email_status)`, with one open grant per pair; `saved_references (viewer_id, container_id, link_id)`.
  - The grant statuses and email statuses live in the db schema.
- **Containers** form an adjacency list. Trashing stamps every active descendant (TS-13), and depth is capped at 32 (TS-18).
- **Principals:** `user`, `mcp` and `guest {linkId, rootId}`. `policies.ts` decides owner reads and writes only.
- **The bootstrap** reads albums, entries, links, fields and values for an owner. Its helpers are private to `sync.ts`.

## Goals / Non-Goals

**Goals:**
- one definition of read access;
- an SQL implementation proven equal to it;
- the shared snapshot;
- tokens.

**Non-Goals:**
- sharing commands (invite, enable link, accept, leave, revoke), which come with TON-65 to TON-67;
- API routes for viewers and guests (TON-68 to TON-70);
- invalidation streams (TON-70);
- search (TON-72).

## Decisions

### 1. Viewers

- **`ShareViewer`** is `{kind: "person", userId}` or `{kind: "link", linkId}`.
- **`viewerOf(principal)`** maps `user` and `mcp` to a person (an MCP connection reads what its user may), and `guest` to its link.
- **An owner's own content** is read through `authorizeOwnerRead`, not through sharing.

### 2. The model

**`readableContainers(state, viewer)`** in `packages/domain/src/sharing.ts` takes `{containers, grants, links, references}` and answers each readable container with the source roots it's read through.

- **The sources:**
  - for a person: their accepted grants' containers, plus the containers of non-revoked links their references name;
  - for a link: its container, if the link isn't revoked.
- **The walk:** from each active source, down through active children only.
- **It assumes nothing about the data:** an active child under a trashed parent isn't reached through that parent.

### 3. SQL

- **`readableContainers(db, viewer)`:** a recursive CTE seeded with the active sources, joining active children. It's bounded by depth 32, like TS-31's other walks.
- **`canReadContainer(db, viewer, id)`:** an upward CTE from `id` that continues only through active nodes, then checks whether any node on that path is a source.
- **Property tests:** `packages/db/src/sharing.test.ts` generates random states and checks both against the model:
  - forests;
  - trashed flags in any combination;
  - grants of every status, for the viewer and for others;
  - links revoked or not;
  - references with and without links.

  Separate scenario tests apply moves, Trash and recovery through the real commands, and check the transitions AC-20 and AC-30 name.

### 4. Tokens

- **`createShareToken()`** returns `{token, hash}`: 32 bytes from `crypto.getRandomValues`, base64url-encoded, and the SHA-256 of the token's text from `crypto.subtle`.
- **`shareTokenHash(token)`** hashes a presented token.
- **`findShareLink(db, token)`** looks the hash up among non-revoked links.
- A token is never stored or logged. It travels only in `/s/` and `/v1/s/` paths (TS-32), from TON-70 on.

### 5. The snapshot

**`sharedSnapshot(db, viewer, containerId)`** answers `undefined` unless the viewer may read the container. Otherwise it reads, in one repeatable-read transaction like the bootstrap:

- the container and its active subtree, with the root's `parentId` set to null so its private ancestor isn't revealed;
- the entries of active albums in those lists, and those albums;
- their service links;
- their field values, and only the fields those values use, with only the options they choose;
- the owner's display name.

`sync.ts` exports the column helpers and a `valuesOfAlbums()` this needs.

## Risks / Trade-offs

- **[A viewer's readable set computed per request]** → Trees are at most 2,000 containers and 32 deep. The CTE touches only the viewer's sources' subtrees.
- **[A choice field's unused options are hidden]** → Viewers only ever see chosen values, so nothing they need is missing. FR-07.12 forbids unused definitions, and options count as part of a definition.

## Migration Plan

None. The value lists move from the db schema to the domain with identical values, so the schema snapshot is unchanged.
