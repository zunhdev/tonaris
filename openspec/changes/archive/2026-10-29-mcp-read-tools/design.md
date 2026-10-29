# Design

## Context

- **What the app already serves:**
  - search (`searchCollection`, TON-62 and TON-72);
  - Shared with me (`sharedWithMe`);
  - sharing access (`canReadContainer`, `readableContainers`);
  - field usage (`readFieldUsage`);
  - the Trash view's units (`unitsOfAccount`).
- **The policy filter:** `filterFields` in `packages/providers` is TS-15's filter, and `album_provenance` records each value's source.
- **Manual order** is per person: `positions(person, view_key, item)`, keys compared bytewise (TS-16). Viewers keep their own order on shared content (TON-69).

## Goals / Non-Goals

**Goals:** TS-63's read group, paginated, policy-filtered, and as the app reads it.

**Non-Goals:**
- write tools (TON-82);
- approval-gated tools and the pending-approvals list (TON-83);
- recovery (TON-84);
- rate limits (TON-85).

## Decisions

### 1. The person's order, as the Manual sort shows it

Listings follow the reader's positions first, then TS-16's fallback:
- folders and lists by creation;
- a list's albums by when they were added;
- Unsorted newest first.

Other sorts are the person's presentation, which they choose in the app. An agent that reorders (`set_order`, TON-82) needs exactly this order.

### 2. Offset cursors

A cursor is an opaque `base64url("o<offset>")` into an order that is stable between calls, with 200 per page. Collections are small (5,000 albums at most), so keyset paging would buy nothing. A cursor the server didn't make is `validation_failed`.

### 3. Shared content through the same tools

`list_container` and `get_album` take the ID of something shared with the person, checked with `canReadContainer` and `readableContainers`. Agents then reach shared content as the app's viewer pages do (FR-10.2, FR-07):
- only active content;
- a shared root's parent hidden unless readable;
- `sharedBy` set to the owner's display name, or "a Tonaris member".

### 4. One album presenter, filtered by policy

`agentAlbum(album, keys)` picks the values a tool shows and runs `filterFields(…, "agent")` on them, with the sources from `album_provenance`. The sources never leave the server. Schemas accept the `withheld` marker in place of each album value.

### 5. `get_overview`'s tree

Every active folder and list, breadth-first, folders before lists and by name at each level, up to 500. A cut-off tree still holds the top levels and says `complete: false`. 500 entries cost an agent about 40 KB. The limit of 2,000 would cost four times that.

### 6. `get_operation` by `idempotencyKey`

It looks the key up as `GET /v1/mutations/{id}` does: the account's own records only. A running capture is `pending`. A key never received is `not_found`, with the note that nothing was applied. TS-22's 30-day retention applies.

## Risks / Trade-offs

- **[Offset pages can shift when the collection changes between calls]** → Each page is read in one repeatable-read transaction. An agent that needs exactness reads `get_album` or lists again.
- **[Field names change from G3's `artist` and `year`]** → No client depends on them yet. The live clients read the descriptions.

## Migration Plan

None.
