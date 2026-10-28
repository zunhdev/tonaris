# Tasks

## 1. Sending captures

- [x] 1.1 Give the outbox lanes and `answeredBefore()`, and make `409 in_progress` no answer in the transport (design decision 1). Verify with `outbox.test.ts`: lanes adopted separately, a capture waiting for an earlier main entry, and a main entry not waiting for a capture; and with `transport.test.ts`: `in_progress` as no answer.
- [x] 1.2 Add `captures.ts` and the capture lane to the sync client, and keep a single write's `needs_input` (design decisions 2 and 3). Verify with `sync.test.ts` against the API with stubbed providers:
  - a capture saved while a rename made after it is saved first (spec: editing while a capture runs);
  - a capture into a list created just before it (spec: into a new list);
  - a batch of three with a choice, settling as items (spec: deciding later in a batch);
  - a choice surviving a reload.
- [x] 1.3 Make captures again through `resubmit()`, and add the choice and details resubmissions (design decision 4). Verify with `sync.test.ts`: Retry after the provider is back (spec: retry), and a chosen candidate saved (spec: choosing).

## 2. Starting a capture

- [x] 2.1 Add `linksIn()`, the paste listener, `C`, and the capture dialog; make every "Add album" open the dialog (design decision 9). Verify with unit tests of `linksIn()` and the shortcut matcher.

## 3. Showing captures

- [x] 3.1 Add the placeholder rows to list and Unsorted views, the decision card, and the capture panel (design decisions 5 and 6).
- [x] 3.2 Add the outcome toasts and the kept-link notice in the inspector, and the capture actions in the batch report (design decisions 5 and 8). Verify the texts with unit tests of the outcome wording.
- [x] 3.3 Add the manual entry modes from a capture (design decision 7). Verify with unit tests of the prefilled forms.

## 4. End to end

- [x] 4.1 Add the browser-test API's stubbed capture (design decision 10).
- [x] 4.2 Verify AC-06 with Playwright (`capture.e2e.ts`):
  - an album link of each service resolving into a list, and a Spotify track link adding its album (specs: pasting in a list; capturing from the dialog);
  - a paste at the root going to Unsorted, with Add to list (spec: pasting elsewhere);
  - a Tidal track link and an Apple link going to manual entry with the link kept (specs: a Tidal track link; Apple's hints offered);
  - a failure kept across a reload, then entered manually with its link (specs: a failure keeps the link; after a failure);
  - an unsupported line (spec: unsupported input);
  - a choice made (spec: choosing);
  - a batch with a failure and the panel (specs: several links at once; a batch with a failure);
  - already in the list, and a kept link replaced from the inspector (specs: already in the list; a kept link);
  - typing in a field captures nothing (spec: typing in a field).

## 5. Docs

- [x] 5.1 Update as built: DS-48, DS-47's capture modes, DS-78's `C`, DS-84's capture actions, DS-46's kept-link notice, and TS-22's capture lane. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate capture-interface --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `link-capture`, and that `openspec validate --all --strict` passes.
