# Tasks

## 1. Domain

- [x] 1.1 Add the link record, `serviceLinkKey()`, the `link` change, the bootstrap's `links`, `link.set` and `link.remove` in `mutationSchema`, and `PreparedLink` in the command context (design decisions 1–3). Verify with `bun run typecheck` and the sync schema tests.
- [x] 1.2 Add `setLink()` and `removeLink()` with the store's `saveServiceLink()` and `deleteServiceLink()`, in `CollectionStore` and `memoryStore`, and capture's `link` changes (design decision 4). Verify with `service-links.test.ts` on the memory store:
  - adding, replacing and removing (specs: replacing keeps one link; adding a link; removing a link);
  - another service's link and an unread link refused (specs: another service's link is refused; unsupported input is refused);
  - a conflict on a changed link, and the same URL changing nothing (specs: replaced in another session; the same link again);
  - someone else's album refused (spec: someone else's album);
  - capture's link inserts in its changes (spec: a captured link reaches the app).

## 2. Database

- [x] 2.1 Implement the store's new methods, links in `bootstrapSnapshot()`, and `executeMutation()` passing a prepared link (design decisions 1, 3, 4). Verify with integration tests: a link saved, replaced and deleted with its `entity_id`, and the bootstrap's links.

## 3. API

- [x] 3.1 Prepare `link.set` in the mutation runner and the batch item runner: parse, follow a short link through `safeFetch`, or fail with the reason (design decision 3). Regenerate the OpenAPI document.
- [x] 3.2 Verify with `service-links.test.ts` through the API, with the short-link fetch stubbed:
  - a pasted variant stored canonical, and a short link followed (specs: a pasted variant is stored canonical; a short link is followed);
  - the link on the stream and in the bootstrap (spec: an edit reaches another session);
  - a kept link from a capture replaced, the entry kept (spec: replacing with the reported alternative; AC-19);
  - refusals and the conflict replayed on a resend.

## 4. Web client

- [x] 4.1 Add the `links` collection, `checkLink()`, the write descriptions, the conflict label, retries and dependencies (design decision 5). Verify with unit tests of `checkLink()`, `describeWrite()` and `dependenciesOf()`, and `sync.test.ts` against the API: a link settling as its canonical URL in another session, and a conflict's Apply mine through `resubmit()`.
- [x] 4.2 Build the inspector's Links section (design decision 6). Verify with Playwright: viewing a link, adding with another service's link refused, replacing, removing with Undo, and the links after a reload. Another session's view is `sync.test.ts`'s.
- [x] 4.3 Add links to the manual entry form (design decision 7). Verify with Playwright: an album saved with a Spotify link, and another service's link refused in the summary (spec: manual entry saves links with the album).

## 5. Docs

- [x] 5.1 Update as built: TS-11's links on clients, TS-40's manual links, DS-46's Links section, DS-47's links, `docs/api/sync-protocol.md`'s mutations and change, and the inspector's and form's placeholder lines. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate service-links --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive creates the `service-links` spec, and that `openspec validate --all --strict` passes.
