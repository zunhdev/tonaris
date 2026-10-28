# Tonaris sync protocol

How a client keeps an account's data in sync with the API and writes to it (TS-28). The web app is the first client. Native apps will implement the same protocol from this document and the OpenAPI document at `/v1/openapi.json` (committed as `apps/api/openapi/v1.json`), which holds every schema named here.

Nothing here assumes a browser. BroadcastChannel, IndexedDB and the leader tab are web-client details (TS-23, TS-24).

## Overview

The protocol has three parts:

1. **Bootstrap.** `GET /v1/sync/bootstrap` returns the account's data as of one point in its change sequence, `seq`.
2. **Stream.** `GET /v1/sync/stream` sends every change after a cursor, in `seq` order, then stays open for live changes.
3. **Writes.** `POST /v1/mutations` takes one change, and `POST /v1/batches` up to 200. Each answers with an outcome. A saved change also arrives on the stream, at its `seq`.

Every account has its own `seq`. It counts the account's saved changes from 1, without gaps. The data a bootstrap returns at `seq = N` plus the changes N+1, N+2, … is the account's current data.

## Authentication

- **Web:** the session cookie, sent with credentials from the web app's origin (TS-08, TS-102). Writes must be `application/json`.
- **Native apps:** an OAuth access token in `Authorization: Bearer` (TS-30), once native apps exist. Today no bearer token is valid on `/v1`.
- **No session** answers `401` with a problem whose `code` is `unauthenticated`. The client should treat it as signed out.

## Bootstrap

`GET /v1/sync/bootstrap` → `Bootstrap`:

```json
{
  "seq": 1342,
  "albums": [...],
  "containers": [...],
  "memberships": [...],
  "links": [...],
  "views": [...],
  "positions": [...],
  "defaults": { ... }
}
```

- **One consistent point.** The records and `seq` come from one snapshot, so the data includes every change up to `seq` and none after it.
- **Contents today:**
  - albums, folders and lists (`containers`), and list entries (`memberships`);
  - the albums' links to the streaming services (`links`), one per album and service, as canonical URLs (TON-46);
  - the person's remembered view choices (`views`), one record per view they made a choice in;
  - their manual order (`positions`), one key per arranged item;
  - their account defaults (`defaults`), always complete: DS-44's first-time defaults until they save their own.

  Custom fields and Shared with me join as their features arrive, as new fields (TS-24).
- **Trash.** Records in Trash are included, but not marked yet; Trash arrives in M5.
- **Artwork** (TON-48). Albums carry `artworkUrl`, set or cleared with `album.setArtwork {id, artworkUrl}` and `base.artworkUrl`; `album.create` makes an album without it. An album with `artworkUrl` carries `artworkSignature`, here and in album changes on the stream. Show the artwork only from `{API origin}/img/{artworkSignature}/{base64url(UTF-8 artworkUrl)}`, never from its own host (TS-103). A failed image means the fallback tile.
- **Compression.** Send `Accept-Encoding: gzip`. The bootstrap is about 2.3 MB of JSON for 5,000 albums, and under 0.5 MB gzipped (TS-120).

## The change stream

`GET /v1/sync/stream?after=<seq>` answers `text/event-stream`.

### Events

- **`change`**: `id` is the change's `seq`, and `data` is a `Change`:

  ```json
  { "seq": 1343, "entity": "album", "id": "…", "op": "update", "data": { ... }, "mutationId": "…" }
  ```

  - `data` is the whole record after the change, or `null` when it was deleted.
  - `mutationId` names the write that made it.
- **`reset`**: `data` is `{"reason": "cursor_expired" | "cursor_unknown"}`. The server can't continue from the cursor, and the stream ends.
  - `cursor_expired`: the history before it is gone (30 days).
  - `cursor_unknown`: the cursor is beyond the account's latest change, as one from another database would be.
- **Comment lines** (`: open`, `: keepalive`): the first starts the response at once, and later ones go out after 20 s without an event. Ignore them.

### Entities and keys

A client keeps one store per entity and applies each change by key:

| `entity` | `id` | `data` |
| --- | --- | --- |
| `album` | the album's ID | `Album` |
| `container` | the folder's or list's ID | `Container` |
| `membership` | `<listId>:<albumId>` | `Membership` |
| `link` | `<albumId>:<service>`, the service being `spotify`, `apple-music`, `qobuz` or `tidal` | `ServiceLink`: `{albumId, service, url}` |
| `view` | the view key: `root`, `unsorted`, or a folder's or list's ID | `ViewPrefs` |
| `defaults` | the account's ID | `ViewDefaults`, never `null` |
| `position` | `<viewKey>:<itemId>` | `Position` |

Clients must ignore entities they don't know. New ones are added within v1 (TS-09).

### Cursors and resuming

- Pass the last `seq` the client applied, as `?after=<seq>` or as the `Last-Event-ID` header.
  - The web app uses `?after=`, because a cross-origin `Last-Event-ID` needs a CORS preflight the API refuses (TS-102).
  - With no cursor, the stream starts at 0, the whole history.
- The stream replays every change after the cursor, then sends live ones. A client that applies them in order never misses or repeats one.
- A change whose `seq` isn't the next one means a bug or a lost event. Reconnect from the last applied `seq`.

### When the stream ends

The server ends a stream in four cases:

- **after `reset`:** bootstrap again, then stream from the new `seq`;
- **on deploy or shutdown:** reconnect;
- **when its session is signed out, revoked or expired**, within 30 s: the reconnect gets `401`, so treat the client as signed out (TS-23);
- **when the client goes away.**

**Reconnecting:**
- If the stream ended cleanly, reconnect at once.
- If connecting fails, back off with full jitter: a random delay between 0 and min(30 s, 0.5 s × 2^attempt). A deploy's clients then don't all return at the same moment.
- Treat a connection that sends nothing for 45 s, not even a keepalive, as dead.

## Writes

### A mutation

`POST /v1/mutations` with a `Mutation` envelope (TS-20):

```json
{
  "mutationId": "0199f5b2-…",
  "name": "album.update",
  "args": { "id": "…", "title": "Kind of Blue (Legacy Edition)" },
  "base": { "title": "Kind of Blue" }
}
```

- **`mutationId`** is a UUIDv7 made once per user intent and kept for every retry (TS-22).
- **New records** get a UUIDv7 the client makes (TS-10), so a retried create can't duplicate.
- **`base`** holds the prior value of exactly the fields being changed (TS-21). A field whose saved value differs is a conflict, and nothing in the mutation applies. Fields not named are never compared, so edits to different fields of one record both apply.
- **The mutations today:**
  - `album.create`, `album.update`, `album.setArtwork`, `album.capture`;
  - `container.create`, `container.rename`, `container.move`;
  - `membership.add`, `membership.remove`;
  - `link.set`, `link.remove`;
  - `view.set`, `defaults.set`;
  - `order.set`.

  The OpenAPI document has each one's `args` and `base`.
- **`album.capture`** saves the album a pasted link names (FR-02.1, TS-44): `{albumId, link, listId}`, where `albumId` is the ID a new album gets and `listId` may be `null` for Unsorted.
  - **It may reuse an album** of the owner's, in Trash or not, and its `confirmed` result says so: `{albumId, match: "created" | "reused" | "restored", alreadyInList, keptLink}`.
  - **It may need input** (TS-26): `match` with candidate albums, or `details` with a prefill. Resubmit as a new mutation with `releaseGroupId` or `details` added.
  - **The server asks metadata sources before saving,** so the request can take seconds. A copy sent while it runs answers `409 in_progress` (below).
  - **It sends the album's link** as a `link` change when it saves one (TON-46).
- **Links** (FR-06.2, FR-06.3), one per album and service (TON-46):
  - **`link.set`** `{albumId, service, url}` adds or replaces the album's link for `service`. `url` is the link as pasted; the server reads it as capture does (TS-40), following a short link, and stores the canonical URL. `base.url` is the URL the client last saw, or `null` for none.
  - **`link.remove`** `{albumId, service}` removes it; `base.url` is the URL the client last saw.
  - **A changed link** is a conflict on the field `url`. Another service's link, or text that isn't a supported album or track link, fails with `unsupported_link` and its reason.
- **Personal preferences follow the same rules** (FR-09.4).
  - **`view.set`** remembers or clears a person's choices for one view: `sortMode` with `sortDir`, `grouped` and `layout`.
    - A field left out stays as it is, and `null` clears it back to the account default. Its `base` is `null` for a choice not made.
    - The sort's mode and direction go together.
    - Folders and the root take `name`, `created` or `manual` and no grouping or layout; lists and Unsorted take `year`, `name` or `manual`.
    - Clearing every field deletes the view's record: the change's `data` is `null`.
  - **`defaults.set`** changes some of the account defaults. Its `base` holds their prior values, DS-44's until saved.
- **Manual order** (TS-16) is a fractional-index key per arranged item, in each of the person's views. Keys compare bytewise. Items without a key follow the arranged ones in the view's fallback order (DS-44).
  - **`order.set`** places items in one view as one move. `args.keys` maps each item's ID to its new key, or `null` to clear its place; `base` maps each to its key before, `null` for none.
    - Each item must be in the view now.
    - A stale base is a conflict per item, whose `field` is the item's ID. Moves of different items both apply.
  - **The server places new items** (DS-51). Expect `position` changes from other mutations:
    - an album entering Unsorted (leaving its last list, or new once Unsorted is arranged) gets a key at its top;
    - an album joining a list loses its Unsorted key;
    - an album leaving a list loses its key there;
    - a moved folder or list loses its key in its old parent.

The answer is `200` with a `MutationResult`: `{mutationId, outcome}`. A malformed envelope answers `422` with a problem and changes nothing.

### Outcomes

`outcome.status` is one of (TS-27):

- **`confirmed`:** saved at `seq`. Its changes arrive on the stream at `seq`. Show the write as saved once the client has applied changes up to `seq`, not when the answer arrives. `result` carries what some mutations report, such as `membership.add`'s `{alreadyInList}`.
- **`failed`:** rejected, and nothing changed (X-05). It has a `code` and an RFC 9457 `problem`. Roll back, and keep the person's input.
- **`conflict`:** a `base` no longer matched. `conflicts` lists each field's `current`, `attempted` and `base` values. Keep the attempt for review (FR-09.4).
- **`needs_input`, `needs_approval`:** the write waits for a choice or an owner's approval (TS-26, TS-64).
- **`skipped`:** a batch item whose prerequisite wasn't confirmed (below).

The server stores the outcome of every write it runs, so sending the same `mutationId` again returns that outcome without applying the write twice. Copies that arrive together wait for each other.

### Batches

`POST /v1/batches` with `{batchId, items}`: 1 to 200 `BatchItem`s, each a mutation envelope plus an optional `dependsOn` naming earlier items' `mutationId`s (TS-25).

- **Order.** Items run in order, each on its own. A success stays saved whatever happens to later items, and its changes reach the stream as soon as it saves.
- **Dependencies.** An item runs only if each item it depends on is `confirmed`. Otherwise it is `skipped`, with `dependsOn` naming the first prerequisite that wasn't and `because` giving that prerequisite's status.
- **Validation.** Each item is validated on its own: an invalid one fails with `validation_failed`, and the rest run. The batch is refused as a whole, with `422`, only when it has no items, more than 200, or a missing or repeated `mutationId`.
- **The answer** is `200` with `{batchId, items: [{mutationId, outcome}]}`, in the order sent.
- **Resending.** Skipped and invalid items aren't stored. Sending the same batch again replays what ran and judges the rest again.

### Unanswered writes

A network error, a timeout, a `5xx`, a `408` or a `429` leaves the outcome unknown: the write is *unconfirmed* (FR-13.3). Never show it as saved, nor as failed. To reconcile it:

- **send the same envelope again**, which is safe by `mutationId`; or
- **look it up** with `GET /v1/mutations/{mutationId}`. It answers the stored `MutationResult`, or `404` if the server never received the write.

A capture still running answers `409 in_progress`, both to its envelope sent again and to the lookup (TS-22). Look it up again a little later. A batch that holds such an item answers `409 in_progress` as a whole; the items before it are saved, and sending the batch again replays them.

A write whose `mutationId` is more than 30 days old and has no record is `failed` with `expired`, never run (TS-22). Any other `4xx` with a problem means the request was judged and nothing changed.

### Sending writes

- **One at a time, in order.** Send from an outbox: the next write only after the previous one has an answer. That keeps causality, such as creating a list and then adding to it.
- **Persist the outbox**, so a restart can still reconcile unconfirmed writes.
- **Several writes at once,** for one user action, go in a batch.

## The client, step by step

1. **Bootstrap**, unless the client kept a cursor. Replace every store with the snapshot, and set the cursor to its `seq`.
2. **Stream from the cursor.** Apply each `change` to its entity's store by key, in order, and advance the cursor.
3. **On `reset`**, go back to step 1.
4. **When the stream ends,** reconnect from the cursor, at once or with backoff as above. On `401`, sign out.
5. **Write optimistically.** Show the edit at once, marked pending, and enqueue the mutation.
   - On `confirmed`, keep it pending until the cursor reaches the outcome's `seq`, then show it as saved.
   - On `failed` or `conflict`, roll back and report.
   - Without an answer, mark it unconfirmed and reconcile as above.

## Limits and errors

- **Size limits:** 200 items per batch, plus the resource limits in TS-18, each refused with `limit_exceeded` or `capacity_exceeded`.
- **Kept history:** change history and stored outcomes for 30 days, pruned daily (TS-91).
- **Errors** are `application/problem+json` with a TS-27 `code` (TS-09). Clients must accept codes, statuses, entities, `because` values and response fields added within v1.
- **Compression:** JSON responses of 1 KB or more are gzipped for clients that send `Accept-Encoding: gzip`. The stream never is.
