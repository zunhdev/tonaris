# Proposal

Linear: TON-29 (Feature). Implements FR-09.1 (automatic synchronization) for the owner's sessions, and the transport FR-09.2 and FR-09.3 build on, with the Q-01 cold-start target. Tech: TS-22, TS-23, TS-24, TS-28, TS-90, TS-91, TS-120. Covers the server side of AC-33 and AC-35. Viewers and guests (M7), preferences (TON-35, TON-36), save-state UI (TON-31) and the leader tab (TON-30) build on it.

## Why

The read path works: a client bootstraps, then streams changes from that `seq`. It resumes after a cut, gets `reset` when its cursor can't be continued, and stays open with keepalives (TON-20, TON-26, TON-27). Four things are missing before clients can rely on it, which TON-20 and TON-21 left here:
- **Revoked sessions keep streaming.** A stream checks the session when it opens, and never again. After sign-out, or once M8's email change and account deletion revoke sessions, it would keep sending a collection to a browser that no longer has access.
- **Nothing prunes the sync history.** The change log and the idempotency records grow forever. TS-22 and TS-23 promise 30 days, and a cursor older than that gets `reset`.
- **The bootstrap goes out uncompressed.** It is 2.33 MB for the reference workload, most of a cold start (TON-21). TS-120 decided that the API gzips its JSON.
- **The protocol isn't written down.** TS-28 wants it in `docs/api/sync-protocol.md`, so native clients can implement it.

## What Changes

- **Streams end with their session.** While streams are open, the hub checks every 30 s that their sessions still exist and haven't expired, and ends the streams of any that don't. The client's reconnect then gets 401. For immediate revocation, M8 can end a session's streams directly through the hub.
- **A daily prune of the sync history.** A schedule in the API process removes change-log entries and idempotency records older than 30 days. It runs under a Postgres advisory lock, so a second instance never runs it at the same time (TS-90, TS-91). It first runs a minute after start, then daily.
- **Gzip for JSON responses.** Responses of 1 KB or more, for clients that accept gzip, are compressed with `Vary: Accept-Encoding`. That covers JSON, problem documents, the bootstrap, and Better Auth's and MCP's JSON. The event stream is never compressed (TS-23).
  - The bootstrap keeps its shape. Grouping entries by list would save 0.42 MB raw, but 0.008 MB *more* once gzipped, measured on the reference workload. It would also break the additive-only contract.
- **`docs/api/sync-protocol.md`:** the client-agnostic contract.
  - bootstrap, the stream, cursors, `reset` and keepalives;
  - mutations, batches, compare-and-set, idempotency and outcomes;
  - entity keys, ordering, compression and limits;
  - the client algorithm a native app follows.
- **TS-23, TS-24, TS-90, TS-91 and TS-120** record what is built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-and-conflicts`: adds the read path:
  - changes reaching every open session;
  - resuming and resetting streams;
  - streams ending with their session;
  - the 30-day history;
  - compressed responses.

## Impact

- **API** (`apps/api`):
  - the hub tracks each stream's session and checks them (`src/sync/hub.ts`);
  - the session guard passes the session ID to the stream route;
  - a new `src/schedules.ts`, started by `src/index.ts` and stopped on shutdown;
  - a new `src/compression.ts` plugin in `createApp`.
- **Database** (`packages/db`):
  - `activeSessionIds` in `accounts.ts`;
  - `pruneSyncHistory` accepts a transaction, for the advisory lock.
- **Docs:** `docs/api/sync-protocol.md`, plus the tech-spec entries above.
- **Contract:** no change to `/v1`'s schemas. Compression is HTTP content negotiation, which clients that don't send `Accept-Encoding: gzip` never see.
