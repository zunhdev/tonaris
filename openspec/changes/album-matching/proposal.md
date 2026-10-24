# Proposal

Linear: TON-44 (Feature). Implements:
- FR-02.9 and FR-02.12, matching per album: a link to any edition of a saved album reuses it, and only MusicBrainz's album or a shared link makes two the same;
- FR-02.10, uncertain matches waiting unapplied while independent items go on;
- FR-14.4, re-addition reactivating a trashed album with only the requested memberships, and FR-14.3's rule that an active record wins;
- FR-01.7, an album at most once in a list, and FR-02.2, capture without a list;
- FR-02.6, an automated addition missing its year asking for it instead of saving;
- FR-06.4, capture filling an absent link and keeping a different one.

Tech: TS-26, TS-44 (with merged release group ids, decided 21 October 2026), TS-22's `in_progress`, and TS-13's re-addition. Builds on TON-42 (identification) and TON-43 (enrichment). Decided by the creator on 24 October 2026: TON-44 includes the server's capture command, without a job queue.

## Why

Identification answers which album a link names, and enrichment fills an album's gaps, but nothing saves anything yet. Capture's promises (AC-07, AC-09) are about saving: reuse the album you already have, bring it back from Trash with only the list you asked for, never guess between albums, and never create an incomplete record. The capture interface (TON-45) and MCP (M9) need one command that keeps them.

## What Changes

- **`album.capture`**, a new mutation: a pasted link, the ID a new album would get, and a destination list or none. It is resubmitted with the person's choice: a release group among the candidates, or the album's details.
- **How it runs** (TS-20, TS-22):
  - the API identifies the link and asks MusicBrainz outside the owner's write lock;
  - the domain command then matches and saves under the lock, against the collection as it then is;
  - while that is running, the same `mutationId` again answers `409 in_progress`, and `GET /v1/mutations/{id}` does too;
  - captures run in batches like any item, and an uncertain one doesn't hold up the others.
- **Matching** (TS-44):
  - **The same album** is the same link (TS-41 step 1), the same release group, or a saved album whose release group MusicBrainz has merged into this one. Similarity alone never is.
  - **An active album wins** over a trashed one (FR-14.3).
  - **A reused album** gets its gaps filled (TS-42) and joins the list, at most once (FR-01.7).
  - **A trashed album** is reactivated: its Trash unit goes, its entries in active lists are removed, those in trashed lists are kept, and only the requested list is applied, else Unsorted (FR-14.4, TS-13).
- **Creating** a new album:
  - from MusicBrainz's values, with their provenance (TON-43);
  - from the person's details, keeping `musicbrainz` or `itunes-lookup` for the values they left as offered (TS-15, TS-41);
  - an identified album MusicBrainz has no year for answers `needs_input` (`details`), prefilled, instead of saving (FR-02.6).
- **Choices** (TS-26):
  - several albums answer `needs_input` (`match`), each candidate naming the saved album it already is, if any;
  - the resubmitted choice must be among the link's candidates.
- **The link** is saved on the album when it has none for that service. A different one is kept and reported (FR-06.4).
- **The result** says whether the album was created, reused or restored, whether it was already in the list, and any kept link, for DS-48's toasts.
- **Docs.** TS-22, TS-26, TS-44 and TS-13 are updated as built, and DS-48's outcomes are mapped to the result.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: gains saving: matching, reuse, Trash re-addition, creation with the required information, choices resubmitted, link conflicts, and captures in batches.
- `sync-and-conflicts`: gains `in_progress` for a mutation still running outside the lock.

## Impact

- **`packages/domain`:**
  - `capture.ts`: the arguments, the prepared source, the result and the command;
  - `album.capture` joins `mutationSchema`, `in_progress` the error codes, and `CommandResult` may be `needs_input`;
  - `CollectionStore` gains reading albums by release group with their identity, filling them, saving links, and reactivating;
  - TON-42's prefill becomes `{source, values}` with the album's field names.
- **`packages/db`:**
  - the store's new methods, and enrichment's writes shared with them;
  - claiming a mutation before its providers run, and storing its outcome after;
  - merge candidates, and `findLinkedAlbum()` preferring an active album.
- **`apps/api`:**
  - `capture.ts`: preparing a capture with the identifier and MusicBrainz;
  - the mutation and batch routes running captures, with the idle timeout off while one runs;
  - the providers passed in;
  - the regenerated OpenAPI document. Every change is additive (TS-09).
- **`apps/web`:** only what the new mutation's type needs, in the write descriptions and batch dependencies. The interface is TON-45's.
- **No schema change.** `mutations` already allows an outcome-less row, and `album_service_links` exists.
