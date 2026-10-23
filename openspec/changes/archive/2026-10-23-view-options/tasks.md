# Tasks

## 1. Domain and protocol

- [x] 1.1 Add `packages/domain/src/views.ts`: the sort modes, directions and layouts; `viewKeySchema`, `viewPrefsSchema`, `viewDefaultsSchema` and `appViewDefaults`; and the `view.set` and `defaults.set` commands with CAS (design decision 1). Add their store methods to `CollectionStore`, and wire them into `runCommand`. Verify with `views.test.ts`:
  - a sort, grouping and layout remembered, and cleared back to the defaults, which deletes the row;
  - the sort's mode and direction required together;
  - a folder sort refused for a list, and grouping refused for a folder;
  - a stale base as a conflict naming the field's current, attempted and prior values (spec: a stale view choice);
  - another person's list as `not_found`;
  - the defaults merged and compared the same way;
  - the same values changing nothing.
- [x] 1.2 Extend `sync.ts`: the `view.set` and `defaults.set` envelopes, the `view` and `defaults` changes, and the bootstrap's `views` and `defaults` (design decision 2). Verify with `bun run typecheck` and the protocol tests in `views.test.ts`: the bootstrap's new fields, and which view keys an envelope takes.

## 2. Storage and API

- [x] 2.1 Add `account_settings` and the two `view_prefs` CHECKs to the schema, and generate the migration with `bun run db:generate`. Verify that `bun run db:check` passes, and that `schema.test.ts` covers the new checks.
- [x] 2.2 Implement the store methods and the bootstrap's `views` and `defaults` in `packages/db/src/sync.ts`. Verify with `packages/db/src/sync.test.ts`:
  - `view.set` logged as a `view` change and seen in the bootstrap;
  - clearing a view deleting its row;
  - `defaults.set` logged as a `defaults` change, with the defaults complete in the bootstrap before and after.
- [x] 2.3 Regenerate the OpenAPI document (`bun run openapi:generate`). Add an API test in `apps/api/src/sync/sync.test.ts`: a `view.set` through `POST /v1/mutations` reaching the stream. Update `docs/api/sync-protocol.md`, and TS-11 in `docs/tech-spec.md`. Verify with `bun run openapi:check` and `bun test apps/api`.

## 3. Client sync

- [x] 3.1 Move the snapshot collection to `client/sync/snapshot.ts`. Add `client/sync/views.ts`, with the `views` and `defaults` collections and their writes, and add them to the sync client (design decision 3). Verify with `client/sync/sync.test.ts`:
  - an insert, an update and a delete each sending the right `view.set`;
  - a defaults update sending `defaults.set`;
  - a change from elsewhere reaching both collections.
- [x] 3.2 Teach `resubmit.ts`, `dependencies.ts` and `describe.ts` the new writes: retry against the current row, a list's choice depending on its creation, and the summaries, field labels and values. Verify with `dependencies.test.ts`, `describe.test.ts` and a resubmit case in `sync.test.ts`.

## 4. Order, grouping and presentation

- [x] 4.1 Extend `features/collection/order.ts` with `sortAlbums`, `sortContainers`, `groupOf`, `groupSequence`, `sections` and `chronology` (design decision 5). Verify with `order.test.ts`:
  - year and name in both directions, with unknown years last and ties by title (specs: by name, descending; live albums by recording year; unknown recording year);
  - manual returning the supplied order;
  - folders first under Name and Created, and creation order under Manual (specs: folders first; manual before arranging);
  - live before EP and Compilation, and singles and unknown types to Unclassified, in DS-43's sequence with empty groups gone (spec: grouping a list);
  - grouping keeping the sorted order within groups (specs: sort kept when grouping; manual order within groups);
  - the `rec.` and fallback cases of `chronology` (specs: a recording range; the release-year fallback).
- [x] 4.2 Add `features/collection/presentation.ts` with `presentationOf`. Extend `CollectionData` with the views and defaults, and order the tree by each level's presentation with `buildTree(containers, order)`. Verify with `presentation.test.ts`, covering a remembered sort winning over the defaults, unset choices following the defaults, and folders always combined in Rows (spec: a default for unvisited views); and with `tree.test.ts`, covering a level in its folder's order.

## 5. Interface

- [x] 5.1 Add `SegmentedControl` to `packages/ui`, on Base UI's `RadioGroup`. Verify with `bun run typecheck` and the axe checks in group 6.
- [x] 5.2 Build `usePresentation`, `ChronologyYear`, the group headers with sticky and collapsed groups in album rows and cards, the hidden type column when grouped, and the folder rows' Created column (design decisions 4, 6, 7 and 10). Verify with the browser tests in group 6.
- [x] 5.3 Build View options with the View button and `V`, remove the layout switch, and seed the account's layouts from the device once (design decision 8). Add `V` to the shortcut matcher and the reference. Verify with `shortcuts.test.ts` and the browser tests in group 6.
- [x] 5.4 Build Settings → Preferences and the Settings subnav. Point the account menu's Settings item, and G then S, to Preferences (design decision 9). Verify with `shortcuts.test.ts` and the browser tests in group 6.

## 6. Browser tests

- [x] 6.1 Add e2e accounts and `e2e/view-options.e2e.ts`, covering the specs in the browser:
  - chronology: `rec.` ranges, the fallback marker with its label, and year order by recording year (AC-14);
  - sorting by Name, descending, and back (spec: by name, descending);
  - grouping a list, with the sequence, the live EP under Live, the single under Unclassified, the type column hidden, and the sort kept (AC-15; specs: grouping a list; sort kept when grouping);
  - manual order the same, grouped and combined (spec: manual order within groups);
  - collapsing a group, kept after a reload;
  - V opening View options, and Direction disabled for Manual;
  - a sort reaching a second signed-in page without reloading (spec: remembered and synced);
  - "Use account defaults" and "Save as my default";
  - Settings → Preferences changing the default for unvisited views only, and the subnav (AC-16; specs: a default for unvisited views; from Preferences to Connections);
  - the root sorted by Name: folders first, the tree in the same order, and Created showing its date column;
  - a device-kept Grid seeding the account;
  - axe finding nothing in View options, grouped rows and Preferences.
- [x] 6.2 Update the existing browser tests for the move: TON-34's layout switch is now in View options, the account menu has "Settings", and G then S goes to Preferences. Verify that `bun run test:e2e` passes.

## 7. Specs and integration

- [x] 7.1 Update `docs/design-spec.md` for what is built: DS-21, DS-24, DS-31, DS-32, DS-40, DS-41, DS-42, DS-43, DS-44, DS-49, DS-78, DS-92 and DS-94, as built in TON-35. Verify the text matches the implementation.
- [x] 7.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify that it passes locally.
- [x] 7.3 Run `openspec validate view-options --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `views-and-ordering`, `app-shell` and `sync-and-conflicts`, and that `openspec validate --all --strict` passes.
