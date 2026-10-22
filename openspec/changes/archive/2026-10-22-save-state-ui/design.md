# Design

## Context

TON-30 left these in `apps/web/src/client/sync`, with nothing showing them (proposal.md, Why):
- **The save states** (`writer.ts`, `createSaveStates`). Each write is tracked by `mutationId` with its record's key and status. Conflicts are kept in IndexedDB until `dismiss`. Listeners hear each state change, but not a dismissal.
- **The engine's connection status:** `connecting`, `live`, `reconnecting`, `signed_out`. Telling *reconnecting* from *offline* was left to this issue (TS-24).
- **The stream's changes** each carry the `mutationId` that made them, or null.
- **The collections:**
  - albums, written by insert and update;
  - folders and lists, written by insert, and by update for rename and move;
  - list entries, written by insert and delete.

Constraints:
- **The CSP** (TS-101) allows `<style>` elements only with the request's nonce. Base UI takes the nonce through `CSPProvider`, which the root document already renders.
- **No rows yet.** There are no album rows, tree or inspector (TON-33, TON-34, TON-38). The creator chose to build everything global now and ship the per-item pieces ready for those rows (22 October 2026).
- **Bun runs the client's logic** against the real API (`sync.test.ts`), but has no DOM. Interface behavior is covered by Playwright against the production build, which drives writes through `window.tonarisSync` (`TEST_HOOKS`).

## Goals / Non-Goals

**Goals:**
- Every AC-33 and AC-35 interface behavior can be shown in the browser: save states, the connection, Activity, failures, conflicts and announcements.
- **Ready for rows.** TON-33, TON-34 and TON-38 wire markers, `aria-busy` and the highlight in with one hook each.

**Non-Goals:**
- **Markers and the highlight in rows,** the failed toast's **Edit**, and inline reasons on fields. They come with the rows and editors (TON-33, TON-34, TON-38).
- **Disabling edit controls offline.** `useConnection()` is ready; there are no edit controls yet.
- **The indicator in the mobile account menu, and the dot on guest pages.** There is no mobile shell or guest page yet.
- **Batch reports** in Activity, and summarizing a batch's failures (TON-32).
- **When and by whom the current value changed.** DS-80 shows this "if known", and the conflict outcome carries neither.

## Decisions

### 1. Save states: what is open, and failures kept like conflicts

`createSaveStates` gains:
- **`open()`:** pending, unconfirmed, failed and conflicting states, oldest first (by `mutationId`, a UUIDv7). The result is cached until the next change, so React can read it through `useSyncExternalStore`.
- **`onChange(listener)`:** any change, dismissals included.
- **`since` on each state:** when it was tracked.
- **`dismiss`** now also clears failures.

Failures are written to the browser as conflicts are, and restored with them, so a failure stays in Activity until retried or dismissed (FR-13.2, DS-80).
- The account's IndexedDB database goes to version 2, adding a `failures` store keyed by `mutationId`.
- `memoryPersistence` mirrors it.

*Alternatives:*
- Storing failures in the `conflicts` store would avoid the version bump, but the store's name would then lie.
- Keeping failures in memory only would let a reload drop them, though DS-80 lists them "until resolved or dismissed".

### 2. Changes from elsewhere

`createSyncClient` registers one more engine consumer: `changesElsewhere`.
- For each applied change, it looks up the change's `mutationId` in the save states. A change this tab didn't write, with a null or unknown `mutationId`, came from elsewhere: another session, tab or agent.
- It notifies the listeners of that record's key (`subscribe(key, listener)`), so 5,000 rows don't each hear every change.
- Bootstraps and resets are not changes, so they notify nothing.

`useLiveHighlight(key, ref)` restarts a `.live-update` class on the row's element for each such change, without re-rendering.
- `globals.css` defines it: a 1.2 s fade from `accent.soft` (DS-17, DS-82).
- Under `prefers-reduced-motion` it is a static 1.2 s tint.

*Alternative:* the Web Animations API with `var(--accent-soft)` in its keyframes. That depends on browser support for `var()` in keyframes, and a class keeps the timing in CSS next to the other motion tokens.

### 3. Connection: offline after 15 s, or at once without a network

`watchConnection({engine, browser, offlineAfterMs = 15_000})` (`client/sync/connection.ts`) derives one of four states:

| State | When |
| --- | --- |
| `connecting` | Before the stream is live for the first time, for up to 15 s |
| `connected` | The stream is live |
| `reconnecting` | The stream dropped and is being retried, for up to 15 s |
| `offline` | The browser reports no network (`navigator.onLine`, `offline` event), even while the stream still reads live, or 15 s passed without the stream |

- **Back online:** the browser's `online` event restarts the 15 s, and the state is *reconnecting* until the stream is live.
- **Why 15 s:** it is the same window TS-24 gives a write before it shows as unconfirmed. Past it, edits can't be confirmed anyway. It is long enough that a deploy's reconnect, which the jittered backoff spreads over the first half second (TS-23), never reads as offline.
- **`connecting`** shows the neutral dot with the tooltip "Connecting…". That is honest before the first bootstrap, when "Up to date" isn't.
- **Not a React hook,** so Bun tests it with a fake engine and browser. `useConnection()` reads it from context.

*Alternative:* `navigator.onLine` alone. It never notices a server that can't be reached while the network is up.

### 4. The indicator and Activity

**The SyncIndicator** is a ghost button in the sidebar footer: a status dot and a label. Its label follows the first state that applies:

| State | Dot | Label |
| --- | --- | --- |
| Offline | danger | "Offline — changes can't be saved" |
| Reconnecting | warning | "Reconnecting…" |
| Unconfirmed changes | neutral | "{n} changes waiting to confirm" |
| Failed or conflicting changes | warning | "{n} need review" |
| A save pending for 300 ms or more | neutral | "Saving…" |
| None of these | neutral | no label; tooltip "Up to date" ("Connecting…" before the first connection) |

- **The 300 ms delay** is `useDelayed(anyPending, 300)`, one timer for the indicator.
- **The "need review" count** isn't in DS-81. It keeps failures and conflicts discoverable after their toasts are closed (DS-02). It is recorded in DS-81 as built.
- **The accessible name** is the label, or the tooltip text when there is no label (DS-115: never color only).

**Activity** is a Base UI Popover anchored above the indicator, titled "Activity". It lists `open()`. Each row shows:
- its `SaveStateMarker`;
- a summary of the change, e.g. "Rename 'Metal' to 'Doom'";
- its state in words, and for a failure the server's reason (`problem.detail`, which is written for people; DS-107);
- its actions: **Retry** and **Dismiss** for a failure, **Review** for a conflict.

With nothing open, it reads "All changes are saved.", or "Nothing is waiting to be saved." when the workspace isn't connected.

### 5. Toasts on Base UI, not Sonner

Sonner 2.0.8 injects its stylesheet as a `<style>` element without a nonce, which the CSP blocks, and every page would log a violation (checked 22 October 2026). Base UI's Toast has what DS-108 asks for:
- a limit of 3;
- timers that pause on hover and focus;
- F6 to reach the viewport;
- `priority: "high"` for an assertive announcement.

It is styled with the same tokens as the other floating layers. `packages/ui/components/toast.tsx` wraps it as `Toaster`, a provider and bottom-right viewport (layer 80, DS-18). Each toast carries its actions as data, so a toast can offer two buttons.

- **Failed:** "Couldn't save {what}", with the reason, **Retry**, and a close button. It has no timeout and high priority.
- **Conflict:** "{What} changed while you were editing", with **Review** and a close button. It has no timeout and high priority.
- **Hidden until reached.** Base UI keeps a high-priority toast out of the accessibility tree until F6 moves focus to the viewport. Until then, a hidden alert carries its title and description.
- A toast's ID is its write's `mutationId`. Resolving the write from Activity or the review closes its toast; closing the toast leaves the write in Activity.
- Writes restored after a reload raise no toast. The indicator's count and Activity carry them.

*Alternative:* Sonner with its CSS imported ourselves. It still injects the blocked `<style>` and logs a violation on every page, which the browser tests' CSP check (`security.e2e.ts`) would have to tolerate.

### 6. Retry and Apply mine resubmit through the collections

`resubmit(client, state)` (`client/sync/resubmit.ts`) makes a write's change again through its collection. The new write is optimistic, tracked, and gets its own `base` from the current row (TS-21), which is exactly "resubmits against the current value" (DS-80).

| Write | Resubmitted as |
| --- | --- |
| `album.create`, `container.create` | insert of the same record, unless it already exists |
| `album.update` | update of the attempted fields that differ from the current row |
| `container.rename`, `container.move` | update of `name` or `parentId` |
| `membership.add` / `.remove` | insert or delete of the entry, unless that is already so |

It answers one of three things:
- **`sent`:** the change went out.
- **`unchanged`:** the current values already are the attempt, so nothing is sent.
- **`gone`:** the record to update no longer exists.

On `sent` or `unchanged`, the old write is dismissed. On `gone`, it stays, and the interface says the record no longer exists. **Keep current** dismisses the conflict.

*Alternative:* resending the stored envelope with a new `base`. That would bypass the optimistic collections, so the person would see nothing until the stream confirmed it.

### 7. Describing a write

`describeWrite(state, names)` (`features/sync/describe.ts`) gives three phrases. It reads names from the collections, falling back to the write's own args for a record that was rolled back.
- **`summary`** for Activity: "Rename 'Metal' to 'Doom'", "Add 'Kind of Blue' to 'Later'".
- **`what`** for "Couldn't save {what}": "the list 'Later'", "changes to 'Kind of Blue'".
- **`subject`** for "{subject} changed while you were editing": the name the person last saw, from `base` where it holds one.

It is a pure function, tested in Bun. The ConflictView's field labels and values (`Name`, `Location`, `Year`, Yes/No, "—" for empty) come from the same module.

### 8. The ConflictView

**The ConflictView** is an AlertDialog (DS-28's base), because it asks for a decision.
- **Title:** "{subject} changed while you were editing".
- **Body:** a table with a row per conflicting field, and **Current** and **Yours** columns.
- **Buttons:** **Keep current** (default focus, since it changes nothing) and **Apply mine** (primary).
- **Escape** closes it and leaves the conflict listed.
- **A record that is gone:** **Apply mine** is disabled and a line says so.

The review is opened from a toast or from Activity through a small `ReviewContext`.

### 9. Announcements

**The announcer.** An `Announcer` renders two visually hidden regions, polite and assertive, from the workspace's first render. `useAnnounce()` gives `announce(text, politeness)`, which other features use for moves, restores and batch summaries (DS-83). It clears the region and sets the text on the next frame, so a repeated message is announced again.

Here:
- **Going offline:** announced assertively, "You're offline. Changes can't be saved until the connection is back."
- **Failures and conflicts:** announced by their high-priority toasts, which Base UI renders as `role="alert"`. Repeating them in the announcer would make screen readers say them twice.
- **Confirmed saves:** never announced.

### 10. Where it is mounted

`SyncProvider` creates the connection watcher with the client, and provides both. A `SaveStateLayer`, inside the workspace, holds:
- the toast manager;
- the review context;
- the announcer;
- the listener that turns settled failures and conflicts into toasts.

The sidebar footer renders the indicator, and the shell's main view renders the offline banner above its content.

## Risks / Trade-offs

- **The database's version bump.** A tab still running the old code is told by the version change to close the database. Reopening it at version 1 then fails, and its writes go on in memory only, with the error logged, until it reloads. → It only affects tabs left open across the deploy that ships this.
- **A large failing batch raises a toast per item.** → Only 3 show at once. TON-32 replaces per-item toasts for batches with the BatchOutcomeReport.
- **Base UI announces a high-priority toast twice to some screen readers**: once through its polite viewport and once through its alert. → This is the library's design; we add nothing on top.
- **A reconnect that takes longer than 15 s reads as offline.** A slow deploy could cause one. → That is the honest state, since changes can't be confirmed. The threshold is one constant.

## Migration Plan

**Deploying:** the account's database upgrades to version 2 when it is next opened, and conflicts kept in version 1 stay where they are. No server change.

**Rolling back:** the old code can't open a version 2 database, so its outbox would run in memory only. Signing out deletes the database.
