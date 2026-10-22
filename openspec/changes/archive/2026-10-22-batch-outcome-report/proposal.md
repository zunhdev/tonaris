# Proposal

Linear: TON-32 (Design). Implements FR-13.4 (batches report outcomes by status, with reasons and next steps, and keep inputs), FR-13.1 (clear failures), FR-13.3 (truthful outcomes) and FR-13.5 (safe retries) in the web app's interface. Design: DS-84, DS-107, DS-108. Verifies the interface side of AC-34.

## Why

TON-31 shows each write's save state, but a batch, one action that changes several things, is shown as loose writes. A batch with eight failures raises eight toasts, three of them visible. Its successes, skips and failures are never shown together, and nothing says which item waited for which. The client also never declares that one write in a batch builds on another, so a list created inside a folder that failed is reported as its own failure rather than as skipped. FR-13.4 asks for outcomes by status, with reasons and next steps, and for inputs kept until resolved. DS-107 and DS-108 set the copy and the toast rules that every later feature (capture, Trash recovery, undo) will reuse.

## What Changes

These follow the creator's decisions of 22 October 2026.

- **BatchOutcomeReport** (DS-84) in Activity. A batch's items are grouped, in this order:
  1. Needs you;
  2. Failed;
  3. Skipped;
  4. Unconfirmed;
  5. Pending;
  6. Completed.

  Each item has its reason and its next action. The header is the summary sentence, e.g. "3 saved · 1 failed · 1 skipped".
  - **While it runs,** every batch shows its report in Activity.
  - **When everything saves,** the report closes by itself, and the summary is announced politely (DS-83).
  - **When anything doesn't save,** the report stays, across reloads, until dismissed. Its inputs are kept with it (FR-13.2).
- **One message per batch** (DS-108). A batch that doesn't fully save raises one persistent toast, "Couldn't save 2 of 5 changes", with the summary and **View report**, which opens Activity at the report. It replaces the per-item toasts.
- **Retrying inside a report.**
  - **Retry** makes the item's change again, together with the items skipped because of it. The new writes take the old ones' place in the report.
  - **Retry all** appears when two or more items can be retried.
  - Completed items are never sent again (FR-13.5).
- **Dependencies inside a batch.** The client declares which writes of a batch build on a record an earlier one creates, e.g. a list inside a new folder. When the earlier write fails, the later one is skipped, naming it (FR-13.4, TS-25).
- **Error copy** (DS-107).
  - Every failure code has a plain fallback for when the server gives no explanation, with one way forward.
  - The "name taken" refusal reads as DS-107 has it: "'Favorites' already exists in Metal. Choose another name."
- **Toast rules** (DS-108):
  - info toasts last 4 s and undo toasts 8 s;
  - failures, conflicts and anything needing a decision stay until closed, and what they report is in Activity;
  - at most 3 show at once;
  - timers pause on hover and focus, and F6 reaches them.

  The rules are one small API that later features use.
- **Docs.**
  - DS-80, DS-81, DS-83, DS-84, DS-107 and DS-108 record what is built.
  - TS-24 and TS-25 record the declared dependencies and the kept reports.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-and-conflicts`:
  - adds batch reports, a batch's one message, retrying within a report, declared dependencies, plain failure copy and the toast rules;
  - changes "A failed edit is reported until dealt with" (a batch's items are reported by their batch), "Activity lists every change not yet saved" (it also lists reports) and "Save problems and going offline are announced" (batch summaries are announced politely).

## Impact

- **Web client** (`apps/web/src/client/sync`):
  - the save states group a batch's writes, and keep a report that didn't fully save;
  - persistence gains a `batches` store (database version 3);
  - the transport declares dependencies within a batch;
  - resubmitting takes several writes at once, into their report.
- **Web app** (`apps/web/src/features/sync`):
  - the BatchOutcomeReport in Activity, which is wider and scrolls, and can be opened from a toast;
  - the batch toast, and the polite batch summary;
  - plain fallbacks for every failure code.
- **UI package:** toast helpers for DS-108's kinds and durations.
- **Domain:** the name-conflict refusal's wording (FR-01.2).
- **Tests:**
  - Bun unit and integration tests for grouping, dependencies, keeping and retrying;
  - `e2e/batch-report.e2e.ts`, with a batch that partly fails (AC-34).
- **API:** no change.
