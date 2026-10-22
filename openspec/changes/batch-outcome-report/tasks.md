# Tasks

## 1. Domain: the name-conflict refusal

- [x] 1.1 Word `siblingConflict` (`packages/domain/src/containers.ts`) as DS-107 has it: "'{name}' already exists in {folder}. Choose another name.", or "at the top level" (design decision 8). Verify with a domain test (spec: a name already taken), for both the root and a folder, and with `bun test` for the domain and API packages.

## 2. Client: batches, dependencies, kept reports, retries

- [x] 2.1 Add `client/sync/dependencies.ts` with `dependenciesOf()`, and send its `dependsOn` in batch bodies from `entrySender` (design decision 4). Verify with `dependencies.test.ts`:
  - a list inside a folder created earlier depends on it;
  - an addition to a new list depends on it;
  - nothing depends on a record that isn't created in the request.
- [x] 2.2 Give `persistence.ts` a `batches` store: the database goes to version 3, with `batches()`, `putBatch()` and `deleteBatch()`, in memory too (design decision 3). Verify with `persistence.test.ts`: reports are kept by ID, replaced, deleted one at a time and cleared.
- [x] 2.3 Extend `createSaveStates` and the writer (design decisions 1–3):
  - batches for transactions of two or more writes;
  - `SaveState.batch`, `reports()`, `onReport()`, `within()`;
  - kept reports written and restored;
  - dismissing members, skipped writes and reports;
  - members' failures kept in their report rather than in their own store;
  - adopted entries of several writes reported as a batch.

  Verify with Bun unit tests (`writer.test.ts`):
  - a batch whose writes all confirm closes by itself;
  - one with a failure stays, is written, and comes back for new save states on the same persistence;
  - dismissing a report deletes it;
  - a write tracked inside `within()` joins its report.
- [x] 2.4 Let `resubmit()` take several writes, grouped into one collection call per collection and operation (design decision 5). Verify with `sync.test.ts` against the real API:
  - a batch creating a taken folder, a list inside it and another list saves the other list, fails the folder, and skips the list naming the folder (spec: a list inside a folder that failed; a batch that partly fails);
  - retrying the folder and the list inside `within()` after the name is freed saves both, into the same report, without creating the other list twice (spec: retrying a failed prerequisite).

## 3. UI package: toast rules

- [x] 3.1 Add `notifier(manager)` to `packages/ui/src/components/toast.tsx`: `info` 4 s, `undo` 8 s with Undo that closes it, and `problem` persistent and high priority (design decision 9). Verify with `toast.test.ts`, using a fake manager (spec: durations by kind).

## 4. Interface: copy, the report, Activity, the batch toast

- [x] 4.1 Give `reasonOf` a plain fallback for every error code (design decision 8). Verify with `describe.test.ts` (spec: a failure without an explanation): every code in `errorCodes` has a fallback, none says "Error" or names the code.
- [x] 4.2 Add `features/sync/report.ts` with the groups, `summarize()`, item reasons including skipped ones, and `retryTargets()` (design decisions 5 and 6). Verify with `report.test.ts`:
  - the group order, with conflicts under Needs you;
  - the summary leaves zero counts out;
  - skip reasons name the prerequisite;
  - retry targets follow skipped chains and never include completed items.
- [x] 4.3 Add the `BatchOutcomeReport`, the marker's new states, and the wider, scrolling Activity. Activity lists reports with loose writes, and opens from an `ActivityContext` (design decision 6). Add `useNotify()` and `useReportFeedback()`: the batch toast, its closing, and the polite summary. Members raise no toast of their own (design decision 7). Verify with `bun run typecheck` and the browser tests in group 5.
- [x] 4.4 Update `save-states.e2e.ts` for what changes:
  - its two unanswered lists now show as one report waiting to confirm, which closes by itself once answered, with a polite summary (spec: a batch still running; everything saved);
  - the name-taken reason reads as DS-107 has it.

  Verify the file passes.

## 5. Browser tests

- [x] 5.1 Add e2e accounts and `e2e/batch-report.e2e.ts`, covering the spec in the browser (AC-34):
  - a batch with a taken folder, a list inside it and two other lists:
    - raises one toast, "Couldn't save 2 of 4 changes", announced as an alert;
    - View report opens Activity at the report, grouped Failed, Skipped and Completed with reasons;
    - the other lists are saved

    (spec: a batch that partly fails; one message for a partial batch);
  - after a reload the report is there without a toast (spec: a report survives a reload);
  - once the name is freed, Retry on the folder saves it and the list inside, the report reads "4 saved", and nothing is created twice (spec: retrying a failed prerequisite);
  - Dismiss removes it, also after a reload (spec: dismissing a report);
  - two failures offer Retry all, which saves both (spec: Retry all);
  - axe finds no violations in Activity showing a report.

## 6. Specs and integration

- [x] 6.1 Update the specs for what is built. Verify the text matches the implementation.
  - `docs/design-spec.md`:
    - DS-80 (skipped and needs-you markers);
    - DS-81 (Activity lists reports, wider and scrolling);
    - DS-83 (batch summaries);
    - DS-84, DS-107 and DS-108, as built in TON-32.
  - `docs/tech-spec.md`:
    - TS-24 (kept reports, database version 3);
    - TS-25 (the web client declares dependencies within a request).
- [x] 6.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.3 Run `openspec validate batch-outcome-report --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/sync-and-conflicts/spec.md` gains the new requirements after the archive and that `openspec validate --all --strict` passes.
