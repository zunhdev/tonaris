# Tasks

## 1. Who may change what (domain)

- [x] 1.1 `authorizeShareEdit` in `policies.ts`; `contentAccess`, `viewOnly`, `insideShare`, `shareTopRefusal` and `collectionFor` in `command-kit.ts`; the store port's `editSourcesAbove` in the in-memory store. Tests in `shared-editing.test.ts`: "A viewer", "A stranger", "A Read-only connection", "Role lowered".
- [x] 1.2 Strangers' refusals become `not_found` in the existing command tests (containers, memberships, albums, artwork, links, field values, capture).

## 2. Folders and lists (domain)

- [x] 2.1 `changeableContainer` returns the access; `container.create` goes into the parent's owner's collection; moves stay inside one share and never move the share's own folder or list. Tests: "A new list in the share", "Renaming the share", "Inside the share", "Out of the share".
- [x] 2.2 `container.delete` refuses the share's own folder or list and records `deletedBy`; `trash.recover` lets that editor undo it in the app, back where it was. Tests: "Deleted to the owner's Trash", "Deleting the share", "Undo", "The owner's deletion".

## 3. Albums (domain)

- [x] 3.1 `changeableAlbum` lets an editor change an album through a list they edit (`editableLists`); field definitions stay the owner's. Tests: "An album in the share", "An album only in private lists".
- [x] 3.2 `membership.add` takes only albums the editor sees; `album.create` takes `listId`; a capture into a share saves in the owner's collection, and an unseen reuse reports `created`. Tests: "An album by its ID", and "A captured album the owner had" in `capture.test.ts`.
- [x] 3.3 An editor's `album.delete` leaves the lists they edit, trashing only an album no other list holds. Tests: "Kept in a private list", "Only in the share".

## 4. The database and the API

- [x] 4.1 `trash_units.deleted_by` with its migration; `editSourcesAbove` and `captureCollection` in `access.ts`; the store's `editSourcesAbove`. `bun run db:check` passes.
- [x] 4.2 The runner locks and logs the owner's account for an editor's change (`targetOf`, `collectionOf`, `ExecutedMutation.accountId`), and keeps the `mutations` row the editor's. A db test in `sharing.test.ts` ("Live to the owner"'s storage).
- [x] 4.3 The announcer publishes to that account; capture prepares against the list owner's collection. A runner test.
- [x] 4.4 The web's dependency and resubmit code handle `album.create`'s `listId`; OpenAPI regenerated.

## 5. Docs and verification

- [x] 5.1 TS-20 and TS-30 record how it's built.
- [x] 5.2 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Push before the archive, so CI's oasdiff judges `album.create`'s new `listId` (it passed), and drop TON-188's spent ignore entries.
- Archive as the PR's last commit, check the merged spec, open the PR with `Closes TON-189`, and merge.
