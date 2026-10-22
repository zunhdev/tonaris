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
{ "seq": 1342, "albums": [...], "containers": [...], "memberships": [...] }
```

- **One consistent point.** The records and `seq` come from one snapshot, so the data includes every change up to `seq` and none after it.
- **Contents today:** albums, folders and lists (`containers`), and list entries (`memberships`). Preferences, positions, custom fields and Shared with me join as their features arrive, as new fields (TS-24).
- **Trash.** Records in Trash are included, but not marked yet; Trash arrives in M5.
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
  - `album.create`, `album.update`;
  - `container.create`, `container.rename`, `container.move`;
  - `membership.add`, `membership.remove`.

  The OpenAPI document has each one's `args` and `base`.

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
