# Design

## Context

- **Built:**
  - `identify()` answers linked, identified, ambiguous, unidentified or failed (TON-42);
  - `describeAlbum()` and `planEnrichment()` answer and plan an album's values (TON-43);
  - `executeMutation()` runs a command under the owner's lock, and `executeBatch()` runs items in order with `runBatch()` (TON-28).
- **Every command so far is quick** and runs entirely inside the lock. A capture asks MusicBrainz at 1 request a second, which takes seconds, so it can't hold the lock while it does (TS-20, TS-22).
- **The `mutations` table** has a nullable `result` and `completed_at`. `executeMutation()` treats a row without a result as an ID already in use.
- **Trash today:** the G3 spike's `trashAlbums()` gives each trashed album its own `album` Trash unit. Clients' album records have no Trash marker yet (M5).
- **`album_service_links`** exists with `entity_id = linkEntityId()`. Nothing writes it yet (TON-46).
- **Bun closes a connection after 10 s without traffic.** The SSE routes switch that off per request with `server.timeout(request, 0)` (TS-23).

## Goals / Non-Goals

**Goals:**
- **One command for the app and for agents.** Matching and saving are decided in the domain, under the lock.
- **Provider work outside the lock,** with retries and in-flight duplicates still answered truthfully (TS-22).
- **Every AC-07 and AC-09 case tested** through the API, with identification and MusicBrainz stubbed.

**Non-Goals:**
- **The capture interface** (TON-45) and MCP's capture tools (M9).
- **A job queue.** The creator chose requests without one on 24 October 2026; a jobs table can come if long pastes need it.
- **Editing links,** and reviewing a kept link (TON-46). Capture applies FR-06.4's rule only.
- **Restoring from Trash, and FR-14.3's conflict on restore** (M5). Capture only prefers the active record.
- **Album capacity** (TON-60).

## Decisions

### 1. Where things live

| Package | File | Holds |
| --- | --- | --- |
| `domain` | `capture.ts` | the arguments' schema, the prepared source, the result, `captureAlbum()` |
| `domain` | `commands.ts` | the dispatch, and the store's new methods |
| `db` | `sync.ts` | the store's new methods, `claimMutation()`, and `executeMutation()` finishing a claimed mutation |
| `db` | `album-writes.ts` | applying an enrichment plan, shared by `enrichAlbum()` and the store |
| `db` | `capture.ts` | `albumsOfReleaseGroup()` and `mergeCandidates()`, read before the lock |
| `api` | `capture.ts` | `prepareCapture()`, and running a capture or a batch with captures |

### 2. The mutation

```ts
album.capture {
  albumId: uuidv7;            // the ID a new album gets (TS-10); a reused album keeps its own
  link: string;               // as pasted, up to 2,048 characters
  listId: uuid | null;        // the destination; null for none (FR-02.2)
  releaseGroupId?: uuid;      // the person's choice among `match` candidates
  details?: AlbumFields;      // the person's details, for `details`
}
```

**Confirmed:** `result` is the `CaptureResult`:

```ts
{
  albumId: string;
  match: "created" | "reused" | "restored";
  alreadyInList: boolean;
  keptLink: { service; kept: string; pasted: string } | null;
}
```

**Needing input:**
- **`match`:** a candidate is `{releaseGroupId, title, albumId: string | null}`. `albumId` is the owner's album already saved as that release group.
- **`details`:** one candidate `{service, url, reason, prefill?}`, where `prefill` is `{source, values}` with the album's field names. TON-42's Apple prefill takes that shape too: `{source: "itunes-lookup", values: {title, artistCredit, originalYear}}`.

**DS-48's toasts** read the result: `reused` and added; `alreadyInList`; `restored`; a `keptLink`.

### 3. Preparing a capture (API, outside the lock)

`prepareCapture()` answers an outcome, or the source the command saves from:

| Identification | Arguments | Prepared |
| --- | --- | --- |
| failed | any | the failure |
| linked | any | `linked`, with the album |
| identified | any | `identified`, with the facts, the merge matches, and `details` if given |
| ambiguous | a `releaseGroupId` among the candidates | as identified, for that release group |
| ambiguous | `details`, no choice | `entered`: none of the candidates |
| ambiguous | otherwise | `needs_input` (`match`), each candidate with its saved album |
| unidentified | `details` | `entered`, with Apple's prefill if any |
| unidentified | none | `needs_input` (`details`), as TON-42 answers |

- **Facts.** `describeAlbum()` for the release group. A release group that answers 404 right after identification is treated as unidentified.
- **Merge matches** (TS-44): only when the owner has no album saved as that release group.
  - **Candidates:** up to 5 of the owner's albums, Trash included, with an MBID other than this one, the same artist key, and title keys of which one contains the other.
  - Similarity only picks whom to ask; it is never evidence.
  - **The check:** `describeAlbum()` on each candidate's saved MBID. One that answers under this release group's id is a match, kept with its own facts, so its enrichment follows the merge (TON-43).
- **The link** is saved as `{service, url, entityId}`: the canonical URL and `linkEntityId()`.
- **Agents.** `agent` is true when the principal is an MCP grant (FR-10.5).
- **Errors.** A `ProviderUnavailableError` from `describeAlbum()` becomes `provider_unavailable`, as `identify()` already answers.

### 4. The command (domain, under the lock)

`captureAlbum(args, source, context)`:
1. **Authorize** the owner, and check the destination: an active list of theirs (`not_found`, `invalid_destination`, `trashed`).
2. **Find the album:**
   - `linked`: that album;
   - `identified`: the owner's albums saved as the release group, active first, then oldest; else the first merge match;
   - `entered`: none.
3. **Reuse** (`reused`, or `restored` when it was trashed):
   - a trashed album is reactivated: its Trash unit is deleted, `trashed_at` and `trash_unit_id` are cleared, and its entries in active lists are removed, with their places (TS-13);
   - for `identified`, the plan from its facts is applied (TON-43);
   - with no list requested, a restored album goes to the top of Unsorted (DS-51).
4. **Create** (`created`):
   - `identified` without details: the plan from `blankAlbum`. If `albumProblem()` finds a value missing, the answer is `needs_input` (`details`), prefilled with the plan's values (`source: "musicbrainz"`), and nothing is written;
   - with details: the person's values. A value equal to the facts' is `musicbrainz`, one equal to the prefill's `itunes-lookup`, any other `user`;
   - the album is inserted with `args.albumId`, the release group if identified, and that provenance. An ID already taken is `validation_failed`;
   - with no list, it goes to the top of Unsorted, as `album.create` does.
5. **The link:**
   - no link for the service: it is inserted;
   - the same entity id: nothing;
   - another: it is kept, and the result's `keptLink` names both.
6. **The list:** `addMembership()`, so FR-01.7, the entry limit and placement are the ones `membership.add` keeps.
7. **Changes:** the album's insert or update when client fields changed, entry deletes and inserts, and position changes.

`CommandResult` gains `needs_input`, which `executeMutation()` stores like any outcome.

### 5. Running it (API)

```
claim ─► replay: the stored outcome
      ─► in progress (claimed < 5 min ago): 409 in_progress
      ─► claimed: prepare ─► outcome: finish with it
                           ─► source: executeMutation(…, { claimed, capture: source })
```

- **`claimMutation()`,** under the owner's lock, in a short transaction:
  - a stored outcome is replayed;
  - a row without one, received under 5 minutes ago, is in progress;
  - otherwise it inserts or refreshes the row (`status: "running"`, no result). The expiry check is `executeMutation()`'s.
- **`executeMutation(…, { claimed: true })`** updates the claimed row instead of inserting one. `finishMutation()` stores an outcome decided before the lock.
- **`in_progress`** joins the error codes as 409.
  - `POST /v1/mutations` answers it as a problem.
  - `GET /v1/mutations/{id}` answers it for a claimed row without an outcome.
- **Batches.** `executeBatch()` takes the item runner. The API's runs captures as above and everything else through `executeMutation()`.
  - An item found in progress ends the request with `409 in_progress`. Items already run stay committed and replay on the next send.
- **The idle timeout.** A request carrying a capture switches it off with `server.timeout(request, 0)`, as the streams do.
- **Without providers,** as in tests that don't stub them, a capture fails with `provider_unavailable`.

### 6. The store's new methods

- **`findCaptureTarget(id)`:** the album as enrichment sees it, with its owner and whether it is trashed.
- **`albumsOfReleaseGroup(ownerId, releaseGroupId)`:** the owner's albums saved as it, active first, then by ID.
- **`fillAlbum(id, plan)`:** TON-43's write of a plan, now in `album-writes.ts`.
- **`insertAlbum(album, origin?)`:** `origin` gives the release group and the provenance. Without it, the values are `user`, as before.
- **`findServiceLink(albumId, service)`** and **`insertServiceLink(link)`.**
- **`reactivateAlbum(id)`:** clears its Trash stamp, deletes its `album` Trash unit, and deletes its entries in active lists. It answers the lists they were in.

### 7. The web client

`album.capture` joins the union. `describeWrite()` says "Add an album from a link", and the batch dependencies treat it as creating `albumId` and referencing `listId`. Nothing sends it until TON-45.

## Risks / Trade-offs

- **[A long request]** → A capture takes seconds while MusicBrainz's queue is busy, and a batch of many captures takes minutes. The idle timeout is off for those requests. TON-45 sends a paste's links one request each, so rows fill in as they finish.
- **[A crash between claim and outcome]** → The row stays claimed. Sending again within 5 minutes answers `in_progress`; after that it runs again. Nothing was written, since writing happens in the final transaction.
- **[A merge MusicBrainz made but the candidates' titles don't show]** → The album is kept twice, the safe failure TS-44 accepts. Enriching it later stores the new id.
- **[Matching sees the collection as it was before the providers ran]** → The command matches again under the lock. A merge match whose album changed meanwhile is re-planned from its saved state.

## Migration Plan

No schema change. `in_progress` and `album.capture` are additive in the OpenAPI document.
