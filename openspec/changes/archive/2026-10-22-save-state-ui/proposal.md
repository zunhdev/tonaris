# Proposal

Linear: TON-31 (Design). Implements FR-09.3 (visible save state) and FR-09.4 (conflict review) in the web app's interface, with FR-13.2 (input kept for retry), FR-13.3 (truthful outcomes), FR-09.1's live updates and PRD section 2.3 (connectivity). Design: DS-80–DS-83. Covers the interface side of AC-33 and AC-35. Batch reports and the shared error copy are TON-32.

## Why

TON-30 made the client keep every write's save state, the conflicts waiting for review, and the stream's connection status, but nothing shows them. A person can't tell a pending save from a saved one, never hears of a failure or a conflict, and isn't told when the connection is gone. FR-09.3 and section 2.3 require all three.

There are no album rows, sidebar tree or inspector yet (TON-33, TON-34, TON-38). This change builds everything global for real and ships the per-item pieces ready for those rows (decided 22 October 2026).

## What Changes

- **SyncIndicator** in the sidebar footer (DS-81):
  - a dot and a label for *connected*, *reconnecting* and *offline*;
  - "Saving…" once a save has waited 300 ms, and "{n} changes waiting to confirm" for unconfirmed ones (DS-80);
  - "{n} need review" while failed or conflicting changes wait.
- **Offline, told apart from reconnecting.** The browser reporting no network, or 15 s without the change stream, counts as *offline*. The main view then shows a slim banner, "Offline — showing what was last loaded".
- **Activity**, a popover from the indicator, lists every change not yet saved: pending, waiting to confirm, failed and conflicting. Each comes with its marker, what it was, and its next step: Retry or Dismiss for a failure, Review for a conflict.
- **Toasts** for failures and conflicts (DS-80). They stay until closed, and failures and conflicts stay in Activity until resolved.
  - "Couldn't save {what} · Retry"
  - "{What} changed while you were editing · Review"
  - They are built on Base UI's Toast, not Sonner: Sonner injects a `<style>` element without the CSP nonce (TS-101).
- **ConflictView** (DS-80) shows each conflicting field: **Current** beside **Yours**.
  - **Keep current** discards the attempt.
  - **Apply mine** saves the attempt again over the current value.
- **Retry** saves a failed change again. Failures are kept in the browser like conflicts, so a reload doesn't lose them (FR-13.2).
- **Announcements** (DS-83):
  - failures and conflicts are announced assertively, through their toasts;
  - so is going offline;
  - routine confirmed saves are not announced;
  - other features use a shared polite and assertive announcer.
- **Ready for rows** (TON-33, TON-34, TON-38):
  - a `SaveStateMarker`, and a hook giving a record's save state for its marker and `aria-busy`;
  - a hook that highlights a row changed elsewhere for 1.2 s (DS-82). The client tells changes from elsewhere from this tab's own by their `mutationId`.
- **Docs:**
  - DS-20 names Base UI's Toast;
  - DS-80 and DS-81 record what is built;
  - TS-24 records the offline rule, the kept failures and changes from elsewhere.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-and-conflicts`: adds the interface's guarantees:
  - visible save states;
  - the connection's status;
  - Activity;
  - deliberate conflict resolution;
  - retrying failures;
  - telling changes from elsewhere;
  - announcements.

## Impact

- **Web client** (`apps/web/src/client/sync`):
  - the save states list what is open and keep failures;
  - persistence gains a `failures` store (database version 2);
  - a tracker of changes from elsewhere;
  - resubmitting a change for Retry and Apply mine.
- **Web app** (`apps/web/src/features/sync`):
  - the connection monitor;
  - the SyncIndicator, Activity, the marker, the toasts, the ConflictView, the offline banner and the announcer;
  - the sidebar footer and the shell's main view host them.
- **UI package:** Popover, Tooltip and Toast on Base UI, styled to DS-15–DS-18, and the live-update highlight's keyframes.
- **E2E:** new accounts and `e2e/save-states.e2e.ts`.
- **API:** unchanged.
