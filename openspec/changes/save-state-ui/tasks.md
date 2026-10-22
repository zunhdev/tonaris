# Tasks

## 1. Client: save states, connection, changes from elsewhere, resubmitting

- [x] 1.1 Give `persistence.ts` a `failures` store: the database goes to version 2, and `failures()`, `putFailure()` and `deleteFailure()` are added, in memory too (design decision 1). Verify with `persistence.test.ts`: failures are kept by `mutationId`, deleted one at a time, and cleared.
- [x] 1.2 Extend `createSaveStates` (design decision 1):
  - `since` on each state;
  - `open()`, cached until the next change;
  - `onChange()`;
  - `dismiss()` for failures;
  - failures kept and restored like conflicts.

  Verify with a Bun unit test (`writer.test.ts`):
  - `open()` lists pending, unconfirmed, failed and conflicting writes, oldest first, and drops confirmed and dismissed ones;
  - a dismissal notifies `onChange`;
  - a failure is restored by new save states on the same persistence (spec: a failure waits in Activity).
- [x] 1.3 Add the `changesElsewhere` tracker to the client (design decision 2). Verify with `sync.test.ts` against the real API (spec: changes from elsewhere):
  - another session's rename notifies this client's listeners for the list's key;
  - this client's own confirmed rename notifies nothing.
- [x] 1.4 Add `client/sync/connection.ts`, `watchConnection()` (design decision 3). Verify with `connection.test.ts`, using a fake engine and browser:
  - `connecting`, then `connected`;
  - a dropped stream reads as `reconnecting`, and as `offline` after the threshold;
  - the browser's `offline` event reads as `offline` at once, and `online` restarts the threshold;
  - live again reads as `connected`.

  These cover the spec's "going offline and back" and "the server can't be reached" at the logic level.
- [x] 1.5 Add `client/sync/resubmit.ts` (design decision 6). Verify with `sync.test.ts` against the real API:
  - a conflicting title, resubmitted, is saved over the newer value, and the conflict is dismissed (spec: Apply mine);
  - a list whose name was taken, resubmitted after the other list is renamed, is saved (spec: retrying after fixing the cause);
  - an attempt equal to the current values answers `unchanged` and sends nothing;
  - an update of a record that is gone answers `gone`.

## 2. UI package

- [x] 2.1 Add `popover.tsx`, `tooltip.tsx` and `toast.tsx` to `packages/ui/src/components`, on Base UI and styled to DS-15–DS-18, with the toast as `Toaster` plus action data (design decision 5). Add the `.live-update` class and its reduced-motion tint to `globals.css` (design decision 2). Verify with `bun run typecheck`, and through the browser tests in group 4.

## 3. Save-state interface

- [x] 3.1 Add `features/sync/describe.ts`, with summaries, `what`, `subject`, field labels and values (design decision 7). Verify with `describe.test.ts`, covering every mutation name, and a rolled-back record named from its args.
- [x] 3.2 Add the announcer, `useConnection()`, `SaveStateMarker`, `useSaveState(key)`, `useLiveHighlight(key, ref)` and `useDelayed()` (design decisions 2, 3 and 9). Verify with `bun run typecheck`; the marker and announcer are covered by the browser tests in group 4.
- [x] 3.3 Add the SyncIndicator with Activity, the toast layer, the ConflictView and the offline banner. Mount them in the sidebar footer and the shell (design decisions 4, 5, 8 and 10). Verify with the browser tests in group 4.

## 4. Browser tests

- [x] 4.1 Add e2e accounts and `e2e/save-states.e2e.ts`, driving writes through the test hook, covering the spec in the browser:
  - a slow save shows "Saving…", lists in Activity, and settles with no state and no toast (spec: a slow save);
  - an answer lost while the stream is up shows "{n} changes waiting to confirm" and lists as waiting to confirm (spec: a save without an answer; changes waiting to confirm; pending changes are listed);
  - a list named like a sibling:
    - raises a toast with the reason and Retry, announced as an alert;
    - stays in Activity after the toast is closed and the page reloaded;
    - after the sibling is renamed, Retry saves it

    (spec: retrying after fixing the cause; a failure waits in Activity; a failure is announced);
  - a conflicting rename:
    - raises a toast;
    - Review shows Current and Yours;
    - Apply mine saves the attempt;
    - a second conflict, reviewed from Activity after a reload, is resolved by Keep current

    (spec: Apply mine; Keep current; reviewing after a reload);
  - offline:
    - the indicator reads offline, the banner shows and the assertive region announces it;
    - back online it reads up to date, without the banner;
    - a confirmed save leaves both live regions silent

    (spec: going offline and back; going offline is announced);
  - axe finds no violations in the open Activity popover and the ConflictView.

## 5. Specs and integration

- [x] 5.1 Update the specs for what is built. Verify the text matches the implementation.
  - `docs/design-spec.md`:
    - DS-20 names Base UI's Toast;
    - DS-80, DS-81 and DS-83 record what was built in TON-31;
    - Edit and markers in rows are left to the rows.
  - `docs/tech-spec.md` TS-24:
    - the offline rule;
    - failures kept;
    - changes from elsewhere.
- [x] 5.2 Note on TON-33, TON-34 and TON-38 in Linear what they wire in: markers, `aria-busy`, the highlight, Edit, and disabling edits offline. Verify the comments exist.
- [x] 5.3 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.4 Run `openspec validate save-state-ui --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/sync-and-conflicts/spec.md` gains the new requirements after the archive and that `openspec validate --all --strict` passes.
