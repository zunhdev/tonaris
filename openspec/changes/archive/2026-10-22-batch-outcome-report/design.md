# Design

## Context

TON-31 left the save states and their interface in `apps/web/src/client/sync` and `apps/web/src/features/sync` (proposal.md, Why).
- **The writer** (`writer.ts`) persists one TanStack DB transaction's writes as one outbox entry. Several writes in one entry go to `POST /v1/batches` (`transport.ts`), split at 200.
- **Each write is tracked on its own** in `createSaveStates` by `mutationId`. A failure or conflict is kept in its IndexedDB store (database version 2) until retried or dismissed.
- **A rejected write** raises its own persistent toast (`save-state-layer.tsx`).
- **Activity** lists `open()`: pending, unconfirmed, failed and conflicting writes.
- **The client never sends `dependsOn`,** so the server runs every item of a client batch on its own (TS-25). A list created inside a folder that failed fails as `invalid_destination` instead of being skipped.

Constraints:
- **TanStack DB 0.15.1 calls a collection's handler synchronously.** `insert()`, `update()` and `delete()` call `transaction.commit()`, whose `mutationFn` runs before its first `await`. So `writer.persist` has tracked the writes by the time the collection call returns.
- **The server judges `dependsOn` only within one request.** An item may depend only on earlier items of the same batch.
- **No surface makes batches yet.** No rows, multi-select, capture or Trash recovery exist (TON-33 onward). As in TON-31, the browser tests drive writes through `window.tonarisSync` (`TEST_HOOKS`).

## Goals / Non-Goals

**Goals:**
- Every AC-34 interface behavior can be shown in the browser with a batch that partly fails:
  - successes kept;
  - a dependent skipped;
  - outcomes by status;
  - retries that never duplicate.
- Capture (M3) and Trash recovery (M5) reuse the report, the copy and the toast rules without reshaping them.

**Non-Goals:**
- **Edit, Decide and Enter manually.** They need the editors, `needs_input` choices and capture (TON-38, M3, M5). The report groups `needs_input` and `needs_approval` items under *Needs you* already, without an action.
- **The capture progress panel** (DS-48). It is capture's, and it will render this report.
- **Keeping a batch's grouping while it is cut short by a reload.** See decision 3.
- **Batches spanning collections.** Each collection persists its own transaction, so a batch is one collection's writes. Capture's album-plus-entry batches come with M3.

## Decisions

### 1. A batch is a transaction with more than one write

`writer.persist` asks the save states for a batch when a transaction holds two or more writes, and tracks each write in it. A batch has:
- an ID, a UUIDv7 made by the client;
- `since`;
- its members' `mutationId`s, in order;
- `kept`.

Each `SaveState` gains `batch?: string`.

- **`reports()`** gives each open batch as `{id, since, items, kept}`, cached until the next change like `open()`. A batch is open while any member is unsettled, or while it is kept.
- **`open()`** still lists every unsaved write, batch members included, so the indicator counts them. It now also lists `skipped`, `needs_input` and `needs_approval`. Activity lists loose writes on their own and members inside their report.
- **Kept.** A batch becomes kept when one member settles as anything but `confirmed`. When its last member settles with every item confirmed, and it was never kept, it closes by itself: it leaves `reports()`. Members' states stay in the map, as confirmed loose writes do, so `elsewhere.ts` still knows them.
- **Events.** `onReport(listener)` reports each change to a batch, with its report and whether it `closed`. The interface derives transitions from it (decision 7).

*Alternative:* one entry as the batch. A transaction over 200 writes is several entries, but it is still one action.

### 2. Dismissing members and reports

- **A member.** `dismiss(mutationId)` now also takes `skipped`, `needs_input` and `needs_approval` writes. Dismissing a member takes it out of its batch. A batch left empty is deleted.
- **A report.** `dismissReport(id)` removes the batch and the states of its settled members. Members still underway become loose writes: a retry in flight settles on its own, and raises its own toast if it fails.

### 3. Kept reports go to the browser, from the first trouble on

The account's database goes to version 3, adding a `batches` store keyed by `id`. A record is `{id, createdAt, items: [{mutation, key, outcome}]}`.
- **When it is written.** A batch is written once it is kept, and again after each later change to it. Writes are coalesced per microtask, so a 200-item answer writes once or twice.
- **What it holds.** Only members with an outcome. A member still underway is in the outbox, which keeps it until answered (TS-22).
- **Where failures and conflicts go.** A batch member's failure or conflict goes into the batch record, not into the `failures` or `conflicts` stores, so a reload restores it once.
- **Restoring.** `restore()` loads the kept reports with the conflicts and failures, as kept, without toasts.
- **Deleting.** A record is deleted on `dismissReport` and when its batch empties.
- **`memoryPersistence`** mirrors it.

*Alternatives:*
- **Writing every batch from creation,** with a record of answers before the outbox deletes an entry. It would keep a batch's grouping across a reload mid-flight. But it adds writes for every ordinary multi-edit, and it races with the outbox, which deletes an entry when it is answered, while confirmed outcomes still wait for the stream. A reload in that window would leave members whose outcome is known nowhere.
- **Our choice:** a reload mid-flight shows the outbox's adopted writes. An adopted entry of two or more writes forms a new batch of its own (`writer.restored`). Nothing is lost, and what failed is still reported.

### 4. The client declares dependencies within a request

`dependenciesOf(mutations)` (`client/sync/dependencies.ts`) gives each item the `mutationId`s of earlier items in the same entry that create a record it references.

| Write | Creates | References |
| --- | --- | --- |
| `album.create` | `args.id` | — |
| `album.update` | — | `args.id` |
| `container.create` | `args.id` | `args.parentId` |
| `container.rename` | — | `args.id` |
| `container.move` | — | `args.id`, `args.parentId` |
| `membership.add`, `.remove` | — | `args.listId`, `args.albumId` |

- **Where it runs.** `entrySender` adds `dependsOn` to each batch item when it builds the body, so a resend sends the same body. Persisted entries keep their shape, and entries kept by older code get dependencies when sent.
- **Why per request.** The server refuses a `dependsOn` naming an item outside the request (TS-25), and the outbox splits at 200. Ordering across requests stays the outbox's (TS-22).
- **What a skip does.** A skipped item rolls back with its transaction, as a failure does (`MutationRejected`).

*Alternative:* inferring in the writer, before the split. A dependency across the 200 boundary would then be refused as invalid.

### 5. Retrying several writes into their report

`resubmit(client, states)` (`client/sync/resubmit.ts`) now takes several writes. It works out each write's remake as TON-31 did, then groups the remakes:
- by collection and operation (insert, update, delete);
- in the order of each group's first write;
- one collection call per group, e.g. `containers.insert([folder, list])`.

So a prerequisite and its dependents travel in one transaction, with their dependencies declared (decision 4). It answers each write's `sent`, `unchanged` or `gone`, and dismisses those not gone. The single-write form stays for loose writes.

**Joining the report.** `states.within(batchId, make)` sets the batch that writes tracked during `make` join. It relies on the synchronous handler call above. The browser test that retries inside a report fails if a TanStack DB upgrade breaks it.

**What Retry takes.** `retryTargets(report, ids)` (`features/sync/report.ts`) gives the chosen failed items plus every item skipped because of them, transitively through skipped chains, in the report's order.
- **Retry** on an item uses its own ID.
- **Retry all** uses every failed item. It is shown when two or more items failed.
- **Conflicts** are not retried: they go through Review (DS-80).
- **Completed items** are never targets (FR-13.5).

*Alternative:* resending the stored envelopes with new IDs. It would bypass the optimistic collections and their fresh `base` (TS-21), as TON-31 decision 6 explains.

### 6. The report in Activity

`BatchOutcomeReport` (`features/sync/batch-report.tsx`) renders one report.

**The header** is a disclosure button. Its text is the summary sentence (`summarize`, `report.ts`):
- counts in this order: saved, need you, failed, skipped, waiting to confirm, saving;
- zero counts left out;
- for example "3 saved · 1 failed · 1 skipped".

Beside it: **Retry all** (two or more failures), and **Dismiss** for a kept report.

**The groups** come in DS-84's order: Needs you, Failed, Skipped, Waiting to confirm, Saving, Completed.
- Each has a heading with its count.
- Completed is folded by default, since it can hold nearly 200 items.
- **Conflicts go under Needs you,** with **Review**: they need a decision (DS-108's "anything needing a decision").

**Each item** shows:
- its marker;
- the write's summary (`describeWrite`);
- a reason:
  - a failure: its reason (decision 8);
  - a conflict: "Changed elsewhere. Review both versions to choose.";
  - a skipped item: "Waits for {what}, which couldn't be saved. Retry it to save this too.", and the like for each `because`;
- its action: **Retry** for a failure, **Review** for a conflict.

**The marker** gains three states:
- skipped: `CircleDashed`, in `fg.tertiary`;
- `needs_input` and `needs_approval`: `CircleHelp`, in `status.warning`;
- in the report only, completed: `CircleCheck`, in `status.success`.

`useSaveState` shows skipped after failed.

**Activity** lists reports and loose writes together, oldest first.
- **Size:** it grows from 320 px to 384 px and scrolls past `min(70vh, available height)`.
- **Opened from a toast.** Its open state moves into an `ActivityContext`, provided by the save-state layer, so **View report** can open it. The report is then expanded, scrolled into view, and its header has the focus.

*Alternative:* a dialog for the report. The creator chose Activity, 22 October 2026.

### 7. One toast per batch, and the summary announced

The layer's `useReportFeedback` follows `onReport`, as `useSettledToasts` follows writes.
- **A batch goes from underway to settled with something not saved:** one persistent, high-priority toast.
  - **Title:** "Couldn't save {n} of {total} changes", or "Couldn't save {n} changes" when none saved.
  - **Description:** the summary sentence.
  - **Action:** **View report**.
  - **Tone:** danger if anything failed, otherwise warning.
  - **ID:** the batch's ID. Raised again after a retry that didn't save it all, the toast is updated, or replaced if it is fading out (Base UI).
- **A batch settles with everything saved:** "{n} changes saved" is announced politely (DS-83), with no toast. That covers a batch closing by itself, and a kept report that a retry made whole.
- **A batch no longer has anything settled and unsaved** (retried, reviewed or dismissed): its toast closes.
- **Writes in a batch raise no toast of their own.** `useSettledToasts` skips states with a `batch`.
- **Restored reports raise nothing,** as restored writes don't.

### 8. Error copy (DS-107)

`reasonOf(outcome)` (`describe.ts`) keeps the server's `problem.detail`, which is written for people. Without one, it falls back to a sentence per error code, e.g.:
- `unauthenticated`: "You're signed out. Sign in again to save this change.";
- `rate_limited`: "Too many changes at once. Wait a moment, then retry.";
- `internal_error`: "Tonaris couldn't save this change. Try again."

Each is plain and blameless, with one way forward, and a test covers every code in `errorCodes`.

The domain's name-conflict refusal (`siblingConflict`, `containers.ts`) becomes DS-107's: "'Favorites' already exists in Metal. Choose another name.", or "at the top level".
- It looks up the parent folder's name, which the store already reads for the destination check.
- Other refusals already follow DS-107.

### 9. Toast rules (DS-108)

`packages/ui/components/toast.tsx` gains `notifier(manager)`, used by the save-state layer and later features through `useNotify()`.

| Kind | Timeout | Priority | Close |
| --- | --- | --- | --- |
| `info(title, description?)` | 4 s | low | its close button |
| `undo({title, onUndo})` | 8 s | low | **Undo** runs `onUndo` and closes it |
| `problem({id, title, …})` | none | high | stays until closed |

- At most 3 show, timers pause on hover and focus, and F6 reaches them. TON-31's `Toaster` already does these.
- *Reachable from Activity* holds by construction: only `problem` toasts persist, and what they report (failures, conflicts, reports) is always in Activity.

*Alternative:* leave `toasts.add` with options at each call. The durations would then live at every call site.

## Risks / Trade-offs

- **A TanStack DB upgrade could call handlers asynchronously,** and a report's retry would then become a loose write. → The browser test asserts the retried item stays in the report. TanStack DB is pinned (TS-24).
- **A reload while a batch is in flight splits its grouping** (decision 3). → Its writes are kept by the outbox, and an adopted entry of several writes reports as a batch of its own.
- **The database version bump to 3.** A tab left open across the deploy is told to close its database, as with TON-31's bump. → Same mitigation: it affects only such tabs, until reload.
- **Batch summaries may be announced twice** once later features announce their own outcome, e.g. a move's "Moved 5 lists to Metal" (DS-83). → Those features can pass a summary of their own then. Noted in DS-83.

## Migration Plan

**Deploying:** the account's database upgrades to version 3 when next opened. Kept conflicts, failures and outbox entries stay where they are. The server change is copy only.

**Rolling back:** the old code can't open a version 3 database, so its outbox would run in memory only, as with TON-31's bump. Signing out deletes the database.
