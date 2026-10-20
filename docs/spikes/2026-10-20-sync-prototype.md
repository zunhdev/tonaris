# Tonaris — Sync prototype: envelope, field CAS, idempotency, change log, SSE and TanStack DB, 20 October 2026

Spike for [TON-20](https://linear.app/zunhdev/issue/TON-20). It builds the sync protocol of [TS-20–TS-24 and TS-28](../tech-spec.md) end to end, on one entity type, albums:

- a mutation envelope with base values;
- field-level compare-and-set;
- an idempotency table;
- a per-account `seq` change log;
- an SSE stream with cursor resume;
- a TanStack DB custom collection whose optimistic writes wait for the server's `seq`.

It is done when tests show conflicts, retries, reconnects and unconfirmed outcomes behaving as FR-09 and FR-13 require.

## Verdict

**The protocol works as TS-20–TS-24 describe, with the refinements below. The tests show every behavior the issue names.**

| FR-09 / FR-13 behavior | Shown by |
| --- | --- |
| Saved changes reach the account's other sessions, and only them (FR-09.1) | API: every session receives the change, no other account does. Client: an insert reaches the other session. |
| An optimistic change is visible at once, is never shown as saved before it is, and a failed one rolls back (FR-09.3) | Client: insert visible in the same tick and marked pending until the stream has it; a rejected edit rolls back with its reason. |
| A change based on a stale value keeps the newer saved value, reports current, attempted and base, and is kept for review (FR-09.4) | Domain, DB, API and client conflict tests. On the client the attempt rolls back and waits in the review queue. |
| Independent edits to different fields both apply (FR-09.4) | Domain, API and client: title and year from two sessions. |
| Every operation reports confirmed, failed, pending or unconfirmed; never success for an unconfirmed one (FR-13.3) | Client: a lost answer and an offline edit go pending → unconfirmed → confirmed; the offline value stays on screen, never as saved. |
| A retry never duplicates or overwrites; an unconfirmed outcome is reconciled before it is retried (FR-13.5) | DB: five copies of one mutation at once apply once. API: replays return the stored outcome. Client: the same envelope sent twice, applied once. |
| Rejections change nothing (X-05) | DB, API and client: a rejected mutation writes no change, uses no `seq` and sends nothing on the stream. |
| Streams resume after a drop without gaps or repeats, and a cursor the server can't continue starts over (TS-23) | Hub unit tests, API and client: resume from the cursor; `reset` for an expired or unknown cursor, then a fresh bootstrap. |

The prototype is the start of M2 rather than throwaway code: it is built where TS-05 puts the sync layer, and M2-03–M2-05 extend it.

## What was built

| Where | What |
| --- | --- |
| [`packages/domain/src/sync.ts`](../../packages/domain/src/sync.ts) | The envelope (`album.create`, `album.update`), the result, change events, the bootstrap snapshot and the `reset` event, as Zod schemas shared by the API and the client |
| [`packages/domain/src/commands.ts`](../../packages/domain/src/commands.ts), [`albums.ts`](../../packages/domain/src/albums.ts) | The album commands against a store port: authorization, required information (FR-02.6) and field-level CAS (TS-21) |
| [`packages/domain/src/ids.ts`](../../packages/domain/src/ids.ts) | `uuidv7()` for every runtime (TS-10), and `uuidv7Time()` |
| [`packages/db/src/sync.ts`](../../packages/db/src/sync.ts) | `executeMutation`, TS-20 steps 2–5 in one transaction; the change log reads; the bootstrap snapshot; the retention prune |
| [`apps/api/src/sync/`](../../apps/api/src/sync/) | The hub and its streams, and four routes: `POST /v1/mutations`, `GET /v1/mutations/{id}`, `GET /v1/sync/bootstrap`, `GET /v1/sync/stream` |
| [`apps/web/src/client/sync/`](../../apps/web/src/client/sync/) | The sync engine, the outbox, the writer with save states and the review queue, the albums collection, and a `fetch` reader for server-sent events |
| [`apps/api/openapi/v1.json`](../../apps/api/openapi/v1.json) | The four operations, plus the `Change` and `StreamReset` components the stream references |

Outside the prototype's scope, for M2 and later: batches with `dependsOn` (TS-25), other entity types, viewer and guest invalidation, the IndexedDB outbox, the leader tab, and the save-state and review UI.

## How it works

**Writing.** `POST /v1/mutations` runs one envelope in one transaction, in `executeMutation`:

1. Lock the account's `account_sync` row with `SELECT … FOR UPDATE`. Every write of the account waits here.
2. Look up the `mutationId`. A stored outcome is returned as it is.
3. Run the command. If it applied changes, advance `seq` by one per change and log each change at its `seq`.
4. Store the outcome, whatever it is.

After the commit, the changes go to the hub.

**Streaming.** A stream on `GET /v1/sync/stream` takes published changes only when they continue its cursor. Otherwise it reads the change log: on connect, after a gap, or when a slow client has 1,000 changes waiting.

**The client.**

- One engine per client bootstraps once, then streams from the snapshot's `seq`, feeding every collection.
- The albums collection turns each optimistic insert or update into an envelope: an update carries the record's prior values as `base`.
- The outbox sends one envelope at a time. One that gets no answer is sent again after a jittered backoff, or as soon as the stream is back.
- The handler resolves once the stream has delivered the mutation's `seq`, so the optimistic value gives way to the same saved value. A rejection or a conflict throws, which rolls back. A conflict's attempt stays in the review queue.

## Findings

These refine the tech spec. TS-10, TS-20, TS-22, TS-23, TS-24, TS-28 and the stack table are updated in the same PR.

1. **`seq` counts changes, without gaps (TS-20).**
   - The lock is `SELECT … FOR UPDATE` on `account_sync`. That replaces `UPDATE … SET seq = seq + 1`, which would have used up a `seq` for every rejection and replay.
   - `seq` advances by one per logged change, at the end of the transaction.
   - With no gaps, a stream or client that sees `seq` skip knows it missed a change and reads the log again.
2. **A copy of a mutation still in progress waits for the lock, then replays (TS-22).**
   - Five copies sent at once apply once, and all five get the same outcome.
   - `409 in_progress` is needed only for a command that works outside the lock, such as a capture waiting on MusicBrainz. TON-28 or M3 adds it with the first such command. `GET /v1/mutations/{id}` exists already.
3. **Every outcome is stored, conflicts included.**
   - Retrying a conflicted mutation returns the conflict, even after the saved value has gone back to the attempt's base. A retry is never a blind write (FR-09.4).
   - Resolving a conflict is a new mutation, with a new ID.
4. **`expired` comes from the UUIDv7 in the `mutationId`.** A mutation with no record that is older than the 30-day window is refused. This relies on the client's clock. A replay misjudged by a wrong clock still meets CAS, and its create meets the client's album ID.
5. **A create of an ID the owner already has duplicates nothing (TS-10).**
   - With the same values it is confirmed without a change. With different ones it is a conflict whose `base` is absent, so `FieldConflict.base` is now optional.
   - An ID another account uses is `validation_failed`.
6. **The stream reads the log whenever it can't trust what it was handed (TS-23).**
   - A lost or out-of-order publish is harmless. Streams already behave as they must once a second instance swaps the in-process bus for `LISTEN/NOTIFY`.
   - A client that stops reading costs no memory beyond 1,000 changes.
   - `reset` carries a reason: `cursor_expired` when the log no longer reaches back to the cursor, `cursor_unknown` when the cursor is ahead of it.
7. **The client needs no buffering at bootstrap (TS-24).** TanStack DB's documented pattern opens the stream first and buffers, for sources without replay. Here the stream replays from the snapshot's `seq`, so the engine bootstraps first and then streams from that cursor.
8. **The web client reads the stream with `fetch`, not EventSource (TS-23).**
   - With `fetch`, it sees a refused stream's status (401) and reconnects when nothing arrives for 45 s, more than twice the 20 s keepalive. It chooses its own full-jitter backoff, starting at 0–500 ms, and the same code runs in Bun tests.
   - **The cursor has to go in the query.** A `Last-Event-ID` header makes the cross-origin request need a CORS preflight, which the API's rules refuse (they allow only `content-type`, TS-102). Chromium then fails the fetch: checked in Playwright, "TypeError: Failed to fetch".
   - EventSource sends that header when it reconnects. An EventSource client would need `last-event-id` added to the CORS allowlist.
   - The API accepts both `Last-Event-ID` and `?after=`, so native clients choose.
9. **TanStack DB has no 1.0 RC yet.**
   - npm's latest is 0.15.1; [PR #2171](https://github.com/TanStack/db/pull/2171), which would publish `1.0.0-rc.1`, is still open.
   - The prototype pins 0.15.1 and writes its handlers the RC's way: they return nothing, wait inside, and callers use `tx.when("settled")`. Moving to the RC should be a version bump.
10. **TanStack DB holds a collection's synced writes while any of its transactions persists (TS-24).**
    - `commit()` from the sync side becomes visible only when the persisting transaction settles, together with the drop of its optimistic state. That is what makes a confirmed write flicker-free.
    - The engine's `awaitSeq` follows its own cursor, not TanStack DB's state, so a handler never waits on the change TanStack DB is holding.
    - The cost: a write that stays unconfirmed keeps other sessions' changes to that collection out of view until it settles. That happens offline, when there is nothing to show anyway. Back online, the outbox retries at once, so the hold lasts a round trip.
    - One collection per entity type keeps a stuck album write from holding containers.
11. **A later pending edit carries an earlier rejected value (TS-24).**
    - TanStack DB's optimistic state for a transaction is the whole record as that transaction saw it.
    - Say the title edit conflicts while a year edit to the same album is still pending. The year edit keeps showing the rejected title, marked pending, never saved, until it settles. Then the saved values replace it.
    - It was not rolled back with the conflicting edit. TON-30 should roll back or rebase a record's later pending edits when an earlier one is rejected.
12. **What counts as no answer (TS-22).**
    - A network error, a timeout (10 s), a 5xx, a 408 or a 429 leave the outcome unknown, so the envelope is sent again.
    - A 4xx with a problem means the request was judged and nothing changed: a `failed` outcome.
    - Separately from the request timeout, a write that hasn't reached the stream within 15 s shows as unconfirmed.
13. **OpenAPI dropped `null` from nullable enums.** `@elysia/openapi` turns Zod's `anyOf: [{enum}, {type: "null"}]` into `type: [..., "null"]` but keeps the enum without `null`. That would make `releaseType: null` invalid for generated clients. `openApiDocument` now puts `null` back, and a test checks it.

## Timings

[`bench.ts`](../../apps/web/src/client/sync/bench.ts) runs two clients of one account against the local API and Postgres, in Bun, on the creator's Mac (Apple M4 Max, macOS 27.2, Bun 1.4.3). It makes 200 sequential title edits, then adds 5,000 albums and bootstraps a fresh client. Three runs agreed within 0.4 ms; the table shows the highest of the three for each figure.

| Measure | p50 | p95 | max |
| --- | --- | --- | --- |
| Optimistic feedback: update → visible in the collection | 0.0 ms | 0.1 ms | 1.2 ms |
| Server confirmation: the POST round trip | 2.4 ms | 3.1 ms | 4.8 ms |
| Settled: confirmation received through the stream | 2.4 ms | 3.3 ms | 5.2 ms |
| Propagation to the account's other session | 2.4 ms | 3.2 ms | 5.1 ms |
| A fresh client's bootstrap of 5,001 albums, ready | 13 ms in each run | | |

On loopback the stream event and the HTTP answer leave the server together, so confirmation, settle and propagation coincide. On a real network, round trips dominate.

A fourth run, while the machine was busy (load average 9), had p95 28 ms and max 98 ms. Adding 5,000 albums, 25 at a time, took 6.4–9.7 s.

These are a floor for one machine, without a browser or React rendering. TON-21 measures the Q-01 targets on the reference devices and workload; the script is a starting point for it.

## Not covered here

- **The client code in a browser.** It has run only in Bun. Playwright checks the protocol from Chromium: CORS, the session cookie, a streaming `fetch` and a write. The first browser run of the client itself comes with the UI, in TON-21 and TON-30.
- **Ending streams when a session ends.** A stream outlives its session until it reconnects. Revocation (TS-70) should end the account's streams.
- **Batches, `needs_input`, approvals and MCP's `idempotencyKey`.** These are TON-28, M3 and M9.
- **The retention job.** `pruneSyncHistory` exists. Scheduling it is TS-91.
- **The host's proxy over HTTP/2.** That needs the creator's host (TS-23).

## Running it again

```sh
bun test packages/domain/src/commands.test.ts packages/db/src/sync.test.ts   # domain and storage
bun test apps/api/src/sync                                                   # hub and conformance suite
bun test apps/web/src/client/sync                                            # client, against the API in a child process
bun run --cwd apps/web test:e2e e2e/sync.e2e.ts                              # the protocol from Chromium
bun apps/web/src/client/sync/bench.ts                                        # timings, about 10 s; --edits, --albums
```

The client tests and the bench start the API with [`apps/api/src/test-server.ts`](../../apps/api/src/test-server.ts) on a fresh test schema, so they need the local Postgres.
