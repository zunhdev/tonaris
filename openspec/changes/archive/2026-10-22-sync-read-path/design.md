# Design

## Context

- **The stream** (`apps/api/src/sync/hub.ts`, `src/sse.ts`, `src/sync/routes.ts`) already replays after `Last-Event-ID` or `?after=`, recovers from gaps and slow clients by reading the log, and ends with `reset` for a cursor the log can't continue. It sends a keepalive comment every 20 s, and ends every stream on shutdown. Tests cover these in `hub.test.ts`, `sse.test.ts` and the conformance suite.
- **The session** is checked once, in the `signedIn` guard, when the stream opens. The guard derives `principal` and `account`, not the session's ID.
- **`pruneSyncHistory(db, now)`** exists (TON-20) and has a test. Nothing calls it.
- **Jobs.** There is no `jobs` table yet. TS-90 runs periodic schedules in the API process under a Postgres advisory lock, and saves the table for queued, retried jobs.
- **Elysia 2's `mapResponse` hook** sees every response: handler objects, handler `Response`s (Better Auth, MCP), problem responses from `onError`, and SSE generators. A `Response` it returns keeps the status and `set.headers` Elysia adds afterwards, multiple `set-cookie`s included (checked with a probe).

## Goals / Non-Goals

**Goals:**
- No stream outlives its session by more than 30 s, whichever way the session ends.
- One scheduling mechanism for TS-91's periodic jobs, which the later ones (Trash expiry, invitation expiry) join.
- The cold-start cost of the bootstrap cut by compression, without touching the `/v1` schemas.

**Non-Goals:**
- **The leader tab** (TON-30).
- **Viewer `shared-invalidate` and guest streams** (M7).
- **Preferences, positions, field definitions and Shared with me in the bootstrap.** They arrive with their features.
- **The `jobs` table and queued jobs** (with email retries and MusicBrainz, TS-90).
- **Pruning approvals** (the same TS-91 row): approvals arrive for real with MCP in M9, which adds them to this schedule.
- **Remeasuring Q-01.** TON-21 measured gzip's size effect, and TON-92 measures acceptance.

## Decisions

### 1. The hub checks sessions on a timer

- `subscribe(accountId, cursor, sessionId)` records each stream's session.
- With a `sessions` source (`{active(ids): Promise<Set<string>>}`), the hub checks every 30 s, while any stream is open:
  - one query for all the open sessions: `select id from session where id = any($1) and expires_at > now()`;
  - every stream whose session isn't returned ends.
- `endSessions(ids)` ends streams at once, for the revocations M8 adds: email change, recovery, account deletion.
- The timer runs only while streams are open. Errors are logged, and the streams kept until the next check.

*Why a timer:* sessions end in several ways: sign-out, expiry, and later revocation by email change, recovery or account deletion (TS-73, TS-74). Some come from Better Auth's own handler. One check covers all of them, at one query per 30 s, however many streams are open.

*Alternatives:*
- Ending streams from the sign-out route only. That misses expiry and every other path.
- Checking per stream on each keepalive. That is one query per stream every 20 s.

**The stream simply ends.** It sends no `reset`: the client's reconnect gets 401, which it already treats as signed out (TS-23). A `reset` would send it to the bootstrap, which then fails the same way.

### 2. Schedules under an advisory lock

`apps/api/src/schedules.ts` exports `startSchedules(db, schedules, options)`. Each schedule is `{name, everyMs, run(tx, now)}`. It runs:

- first after `firstAfterMs` (60 s), so startup isn't slowed;
- then every `everyMs`.

Each run is one transaction that first takes `pg_try_advisory_xact_lock(hashtext(name))`, and skips the run if another instance holds it. The lock goes with the transaction, so no pooled connection can keep it. TS-90 names `pg_try_advisory_lock`; this is its transaction-scoped form.

- `stop()` clears the timers and waits for a run in progress, so `index.ts` can close the database after it.
- The first schedule is `prune-sync-history`, daily. `pruneSyncHistory` takes the transaction, so the delete runs under the lock.
- Test servers don't start schedules; their tests call `runSchedule` directly.

### 3. Compression in `mapResponse`

`apps/api/src/compression.ts` is a global `mapResponse` plugin. It compresses only when all of these hold:

- the request accepts gzip (`Accept-Encoding` lists `gzip` without `q=0`) and isn't `HEAD`;
- the response is JSON: a handler object, or a `Response` whose content type is `application/json` or `application/problem+json` and which isn't already encoded;
- the body is at least 1 KB.

Then it returns the gzipped body (`Bun.gzipSync`) with `Content-Encoding: gzip` and `Vary: Accept-Encoding`. Generators (the event stream) and strings pass untouched, so the stream is never buffered or compressed.

- *1 KB:* below that, gzip's framing eats the gain, and most small responses are problems or `GET /v1/me`.
- *In the API, not at the edge:* TS-120 decided it, so it holds on any host (TS-110).

### 4. The bootstrap keeps its shape

Grouping entries by list was TON-21's idea for the bootstrap's largest part. Measured on the reference workload:

| Bootstrap | Raw | Gzipped |
| --- | --- | --- |
| Flat (now) | 2.32 MB | 0.446 MB |
| Entries grouped by list | 1.90 MB | 0.454 MB |

Gzip already removes the repeated list IDs. Grouping would gain nothing compressed, and would remove the `memberships` field, which `/v1` can't do (TS-09).

### 5. The protocol document

`docs/api/sync-protocol.md` is written for someone building a native client from it and the OpenAPI document alone:

- the endpoints and what each guarantees;
- the client algorithm: bootstrap, stream from `seq`, apply changes by key, re-bootstrap on `reset`, send writes from a sequential outbox, wait for `seq ≥ result.seq` before showing a write as saved, and reconcile unanswered writes by resending them or looking them up;
- entity keys, compression, limits and error handling.

It cites TS IDs, and the OpenAPI document stays the source for schemas.

## Risks / Trade-offs

- **Up to 30 s of changes after a revocation.** → The bound is documented. M8 calls `endSessions` where revocation must be immediate.
- **Gzip costs CPU per response.** The bootstrap takes about 15 ms to compress. → Acceptable for one call per session start. Small responses are skipped.
- **A prune on every deploy's startup.** → It is idempotent and cheap once the history is short. The advisory lock keeps two instances from overlapping.

## Migration Plan

No schema change. Deploying starts the session checks, the schedule and compression. Rolling back stops them, and the history, already pruned to 30 days, simply grows again.
