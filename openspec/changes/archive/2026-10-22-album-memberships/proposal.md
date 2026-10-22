# Proposal

Linear: TON-27 (Feature). Implements FR-01.6 (albums in many lists), FR-01.7 (one entry per list), FR-01.8 (album retention), FR-01.9 (Unsorted), FR-01.10 (container removal keeps albums), FR-02.6 (required information) and FR-02.12 (album identity), with FR-09.1 for entries reaching every session and the membership limit of FR-15.4. Tech: TS-11, TS-13, TS-18, TS-20. Covers the domain behaviors of AC-05 and AC-08. Trashing containers is TON-55 and capacity counting TON-60; the form that enforces AC-08 on screen is TON-38.

## Why

Albums and lists both exist, but nothing puts an album in a list. List entries are rows that only the bootstrap reads and an MCP stand-in writes. Manual entry, capture, views, manual order and Trash all build on them (TON-38, M3, TON-34 to TON-36, TON-55). Those rules need one command that the app and MCP share:
- an album is one record however many lists it is in;
- it is in a list at most once;
- it stays in the collection when it leaves its lists.

The albums table still carries `edition_label` and `barcode`. The decision of 19 October 2026 (FR-02.12) drops them: Tonaris identifies albums, not editions.

## What Changes

- **Two new mutations** on `POST /v1/mutations` (TS-20), run under the owner's write lock:
  - `membership.add {listId, albumId}`: puts an active album in an active list. Re-adding an album already there keeps its entry and `addedAt`, changes nothing, and confirms with `result: {alreadyInList: true}` (FR-01.7).
  - `membership.remove {listId, albumId}`: takes the album out of the list. The album and its other entries stay, and an album left in no list is in Unsorted (FR-01.8). Removing an entry that isn't there confirms with no change.
- **Rejections change nothing (X-05)**, with TS-27 codes:
  - `not_found`: a missing list or album, or another person's album;
  - `permission_denied`: another person's list, or a read-only connection;
  - `invalid_destination`: a folder, which holds no albums;
  - `trashed`: a list or album in Trash;
  - `limit_exceeded`: more than 50,000 entries, **Trash included** (TS-18, decided 22 October 2026).
- **Entry changes** go into the change log and the owner stream as `entity: "membership"`, keyed `<listId>:<albumId>`. The bootstrap already carries entries.
- **Unsorted stays a query** (TS-13): active albums with no entry in an active list. No flag or table marks it, so leaving the last list, or the list going to Trash, puts an album there without any write to the album (FR-01.9, FR-01.10).
- **Required information** (FR-02.6) is the existing `albumProblem` check on create and edit. This change states it as requirements and tests each case: live albums, and edits that would clear a year.
- **Albums, not editions** (FR-02.12): a migration drops `edition_label` and `barcode` from `albums`. The workload generator stops producing them, and its separate "reissue" records too, which FR-02.12 makes duplicates.
- **The web sync client** applies entry changes from the stream, so another session's additions and removals appear live. Adding from the UI comes with TON-30 and TON-38.
- **TS-18** gains the membership decision, and TS-11 and TS-24 record what this change built.

## Capabilities

### New Capabilities

- `album-records`: album records and their place in the collection:
  - one record per album, shared by every list it is in;
  - one entry per list;
  - retention when entries go;
  - Unsorted;
  - the required information every album has.

  Links, matching, metadata editing and Trash add to it later.

### Modified Capabilities

None. `collection-hierarchy` keeps folders and lists; what happens to their albums is `album-records`.

## Impact

- **Domain** (`packages/domain`):
  - membership commands in a new `memberships.ts`;
  - `CollectionStore` gains entry methods, and its albums report Trash;
  - the envelopes, the membership change and the add result in `sync.ts`;
  - `maxMemberships` in `limits.ts`;
  - commands may return a `result`.
- **Database** (`packages/db`):
  - the store's entry methods;
  - `executeMutation` stores a command's result;
  - a migration drops `edition_label` and `barcode`.
- **API:** no new route. `POST /v1/mutations` takes the new names, and the stream sends entry changes. The committed OpenAPI document is regenerated, with additions only (TS-09).
- **Web** (`apps/web/src/client/sync/lists.ts`): the entry collection applies stream changes.
- **Tooling** (`tooling/src/workload`): no edition labels, barcodes or reissues. The reference workload's shape (TS-120) is unchanged.
- **MCP:** unchanged. `add_to_list` stays TON-23's stand-in until batches (TON-28) and M9 put it on these commands.
