# Proposal

Linear: TON-30 (Feature). Implements FR-09.3 (visible save state), FR-09.4's review queue across reloads, FR-13.5 (safe retries) and PRD section 2.3 (connectivity) in the web client, with FR-13.4's batches from the app and FR-11.1's sign-out. Tech: TS-22, TS-23, TS-24. Covers the client side of AC-33, AC-34 and AC-35. The save-state UI (markers, SyncIndicator, Activity, conflict view) is TON-31, and the sidebar that writes folders and lists is TON-33.

## Why

TON-20 built the client store for albums in `apps/web/src/client/sync`: an engine that bootstraps and streams, an outbox that sends one mutation at a time and resends unanswered ones, save states with a conflict queue, and a TanStack DB albums collection. It has never run in the app, and it keeps everything in memory:
- **A reload drops unsent writes.** A reload or a closed tab loses the queued and unconfirmed writes, and the conflicts waiting for review. FR-13.5 and section 2.3 ask that interrupted writes be reconciled, not lost.
- **Every tab opens its own stream.** That is one long-lived connection per tab, against HTTP/1.1's per-host limit (TS-23).
- **Only albums can be written.** Folders, lists and list entries are read-only, though their commands exist (TON-26, TON-27).
- **Each write is its own request.** A many-item transaction sends one request per item, though `POST /v1/batches` exists (TON-28).
- **A rejected value lingers** (TON-20). After a conflict, a later pending edit to the same record keeps showing the rejected value until it settles.
- **No browser has run the client yet.** Playwright has only exercised the protocol.

## What Changes

- **Writes survive a reload.**
  - The outbox and the conflict review queue are kept in IndexedDB, per account.
  - Each tab owns its outbox entries and holds a Web Lock while it lives.
  - A reloaded or closed tab's entries are adopted by the leading tab, which resends them. The server applies them once or returns their stored outcomes (TS-22).
  - Until that answer, they show as unconfirmed.
- **One stream per browser** (TS-23).
  - A leader tab, elected with a Web Lock, holds the change stream and relays each change, its connection status and `reset` to the other tabs over BroadcastChannel.
  - Every tab bootstraps itself over HTTP, and sends its own writes.
  - When the leader goes, another tab takes the lock and streams from its cursor, so nothing is missed.
- **Writable folders, lists and list entries.** The containers collection writes `container.create`, `.rename` and `.move`. The entries collection writes `membership.add` and `.remove`.
- **A transaction's writes go as one batch** (`POST /v1/batches`), up to 200 per request. A single write still uses `POST /v1/mutations`.
- **A rejected write rolls back the record's later pending edits** from view. They still go to the server, and their saved values come back on the stream.
- **The client runs in the workspace.**
  - A `SyncProvider` starts it for the signed-in account, and goes to sign-in when its session ends.
  - With `TEST_HOOKS=1`, the page exposes the client to browser tests.
- **Sign-out asks, then clears** (decided 22 October 2026). With writes still unsent, Sign out first asks "N changes haven't been saved yet. Sign out anyway?". Signing out deletes this browser's Tonaris data for the account.
- **TS-22, TS-23 and TS-24** record what is built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-and-conflicts`: adds the client's guarantees:
  - saved only once confirmed;
  - unsent writes surviving a reload;
  - edits made while disconnected;
  - conflicts kept for review across reloads;
  - no lingering rejected values;
  - one stream across tabs;
  - batched transactions;
  - sign-out with unsent changes.

## Impact

- **Web client** (`apps/web/src/client/sync`):
  - persistence (`persistence.ts`, with IndexedDB and in-memory stores);
  - tab coordination (`tabs.ts`, Web Locks and BroadcastChannel, with an in-memory version for tests);
  - the engine's follower mode;
  - the outbox's entries, batches, persistence and adoption;
  - the writer's restored writes and persisted conflicts;
  - writable container and entry collections.
- **Web app:**
  - `src/features/sync/` (the provider and the test hook);
  - the workspace layout;
  - the account menu's sign-out;
  - an `AlertDialog` from shadcn on Base UI in `packages/ui`.
- **E2E:** new accounts and `e2e/sync-client.e2e.ts`. The preview server gets `TEST_HOOKS=1`.
- **API:** unchanged.
