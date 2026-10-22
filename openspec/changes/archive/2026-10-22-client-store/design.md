# Design

## Context

`apps/web/src/client/sync` (TON-20, extended in TON-26 and TON-27):
- **`engine.ts`** bootstraps, streams from the snapshot's `seq` with `fetch`, reconnects with full-jitter backoff, and re-bootstraps on `reset`. It resolves `awaitSeq` as the cursor advances.
- **`outbox.ts`** sends one mutation at a time, in order. It resends an unanswered one after a backoff, or when the stream is back.
- **`writer.ts`** turns a TanStack DB transaction's mutations into outbox sends, and settles them once the stream reaches their `seq`. It keeps save states and the conflict queue.
- **The collections:** albums are writable; containers and entries are read-only and follow the stream.
- **`client.ts`** wires one client per page. Nothing in the app creates one yet; only the perf harness does.

Constraints:
- **TanStack DB 0.15.1** cascades a rollback only to transactions still `pending`. A collection handler's transaction is already `persisting`, hence TON-20's lingering value.
- **Bun has no IndexedDB and no Web Locks.** So the stores and the tab coordination are ports, with in-memory versions for the Bun suite, and Playwright covers the browser versions.
- **Browser tests run a production build** under `vite preview` (TS-121).

## Goals / Non-Goals

**Goals:**
- No write is lost or applied twice across reloads, closed tabs, lost answers and offline spells.
- One stream per browser, with any tab able to take it over.
- Every entity M2 has is writable through its collection, ready for the UI issues.

**Non-Goals:**
- **The save-state UI** (TON-31): markers, the SyncIndicator, Activity, the conflict view, and the reconnecting/offline timing DS-81 leaves to the tech spec.
- **Keeping collection data in the browser.** A reload bootstraps again; offline use isn't promised (section 2.3). The cursor is therefore not stored either, since it is worthless without the data.
- **Re-applying a reloaded edit's optimistic value.** After a reload, an unsent edit shows as unconfirmed in the save states, and its value arrives through the stream once it is saved.
- **Writers in the UI.** The sidebar (TON-33) and the album form (TON-38) use these collections.

## Decisions

### 1. Persistence: one IndexedDB database per account

- `persistence.ts` defines `SyncPersistence`:
  - outbox entries: load, put, delete;
  - conflicts: load, put, delete;
  - `clear()`.
- `indexedDbPersistence(accountId)` opens `tonaris-sync:<accountId>`, with two object stores:
  - `outbox`, keyed by entry ID, with its owner tab and creation order;
  - `conflicts`, keyed by `mutationId`.
- `memoryPersistence()` serves the Bun tests.
- A database per account means another account signing in on the same browser never sees these writes.

*Alternative:* `localStorage`. It is synchronous, capped at about 5 MB, and has no transactions to keep two tabs from clashing.

### 2. Outbox entries are transactions, owned by tabs

- An entry is one TanStack DB transaction's writes, `{id, tab, items: [{mutation, key}]}`, in creation order.
  - One item goes to `POST /v1/mutations`.
  - Several go to `POST /v1/batches`. A transaction of more than 200 is split into consecutive entries.
- The outbox persists an entry before sending it, and deletes it once answered.
- Each tab gets a random ID and holds the Web Lock `tonaris-tab:<id>` for its life.
- **Adoption.** The leading tab adopts entries whose owner's lock is no longer held, when it becomes leader and every 10 s after:
  1. take that tab's lock with `ifAvailable`;
  2. re-read the entries under it, and rewrite their owner;
  3. queue them at the head, as unconfirmed.

  Two tabs can't adopt the same entry: the second waits for the lock, then finds the entries already re-owned.
- **Sending them again.** Adopted entries carry their original envelopes, so the server applies them once or replays their stored outcomes (TS-22), and CAS keeps them from overwriting newer values.

*Alternative:* a single outbox in the leader, with followers sending writes over BroadcastChannel. That is one queue, but a write would be lost if the leader died between receiving it and persisting it, and every write would cost a round trip between tabs.

### 3. Leader and followers

`tabs.ts` defines `TabCoordinator`:
- `id`;
- `lead(signal)`, which resolves when this tab holds the leader lock `tonaris-leader:<accountId>`, and keeps it until `signal` aborts or the page goes;
- `channel`, with `post` and `subscribe`;
- `isAlive(tabId)` and `adopt(tabId, task)`, for decision 2.

The browser version uses `navigator.locks` and a `BroadcastChannel` named `tonaris-sync:<accountId>`. `memoryTabs()` simulates several tabs of one browser in one process, for the Bun tests.

The engine, given a coordinator:
- **Every tab** bootstraps itself (a GET; only the stream is scarce), then waits for leadership while following the channel.
- **A follower** applies relayed changes by `seq`:
  - it skips what it has;
  - after a gap it bootstraps again;
  - it buffers what arrives during its own bootstrap.

  It mirrors the leader's status, and bootstraps again on a relayed `reset`.
- **The leader** streams from its cursor, as today, and posts each change after applying it, every status change, and `reset`.
- **When the leader goes,** one follower gets the lock and streams from its own cursor. The stream replays from there, so nothing between the two is lost.

Without a coordinator, as in the perf harness and existing tests, the engine works as before.

### 4. The writer

- `persist(transaction, items)` sends one outbox entry, settles each item from its outcome, and waits for the stream to reach the highest confirmed `seq`.
- **Rejections.** If any item is rejected, the transaction rolls back as before. Before rethrowing, the writer rolls back the other `persisting` transactions with a mutation on the same keys (decision 5).
- **Restored entries** are tracked as unconfirmed. They settle when answered, with no TanStack DB transaction behind them.
- **Conflicts** are written to persistence when they settle, deleted on `dismiss`, and loaded at start.

### 5. Rolling back later edits of a rejected record

The writer keeps the persisting transactions by key. On a rejection, it calls `rollback()` on the others that share a key:

- Their optimistic rows go, so the rejected value can't linger.
- Their mutations stay in the outbox, are sent, and settle in the save states. Their values come back through the stream once saved.
- TanStack DB ignores the handler's later return for a transaction already rolled back.

*Alternative:* rebasing the later edits onto the current row, as new optimistic transactions holding only their own fields. That would avoid the brief disappearance, at the cost of a second transaction kind for a rare case. It can come later without changing the store's contract.

### 6. Writable folders, lists and entries

The collections module takes the writer, like the albums one:

- **Containers:**
  - insert writes `container.create`;
  - update writes `container.rename` for a new name and `container.move` for a new parent, each with its `base`, both in one batch when both changed.
- **Entries:**
  - insert writes `membership.add`, with an optimistic `addedAt` of now;
  - delete writes `membership.remove`.

Deleting containers waits for Trash (M5).

### 7. The client in the app

`src/features/sync/sync-provider.tsx` creates the client in the workspace layout, for the signed-in account, with IndexedDB persistence and the browser coordinator. It starts on mount and stops on unmount.

- **Signed out elsewhere.** When the engine reports `signed_out`, from a revoked session or another tab signing out, the provider forgets the account and goes to sign-in.
- **Test hook.** When the page carries `<meta name="tonaris:test-hooks">`, the provider puts the client on `window.tonarisSync` for Playwright. The web server renders that meta only with `TEST_HOOKS=1`, as it renders the API URL, so the production build is the one under test.

### 8. Sign-out

The account menu reads the client's unsent entries:

- **None:** sign out as now.
- **Some:** an `AlertDialog` (shadcn on Base UI) asks "{n} changes haven't been saved yet. Sign out anyway?", with **Sign out** and **Cancel**. Cancelling changes nothing.
- **Signing out** stops the client, deletes the account's database, then signs out.

## Risks / Trade-offs

- **A leader that hangs, without dying, keeps the lock**, and followers get nothing. → The leader's stream has its own silence timeout and reconnects, so a hang needs the page itself to freeze. A frozen page is suspended, and a hidden tab's lock remains valid, which is fine.
- **Adoption every 10 s** means a closed tab's writes wait up to 10 s if another tab stays open. A reload or a new tab adopts at once, on start.
- **Rolling back later edits** shows the old value briefly until they are confirmed: about one round trip online, or until reconnect. → Rare, and their markers stay pending; rebasing remains possible (decision 5).
- **IndexedDB can be unavailable,** as in Firefox private windows before version 115. → The client falls back to memory persistence and logs it; writes then don't survive a reload, as before.

## Migration Plan

No server change. Deploying puts the client in the workspace. Rolling back removes it, and the IndexedDB databases left behind are deleted at the next sign-out of a version that has them.
