# Tasks

## 1. Domain

- [x] 1.1 Add `fields.ts` with the record, the rules and the commands; the mutations, change and bootstrap field; the limits; and the store's methods in `CollectionStore` and `memoryStore` (design decisions 1–4). Verify with `fields.test.ts` on the memory store:
  - a choice field with options, and options on a number field refused (specs: a choice field with options; options on a field that takes none);
  - the field limit (spec: past the limit);
  - a name in another type, two options with one label, and another account (specs: the same name in another type; two options with one label; another account);
  - a case-only rename and a conflict (specs: a case-only rename; renamed elsewhere);
  - a create sent again.

## 2. Database

- [x] 2.1 Implement the store's field methods and fields in the bootstrap. Verify with `fields.test.ts` against Postgres: a field and its options saved in order, the bootstrap, and a rename keeping a trashed album's value (spec: a rename reaches albums in Trash).

## 3. API and web

- [x] 3.1 Regenerate the OpenAPI document. Add the fields collection, descriptions, retries and dependencies (design decision 5). Verify with `describe.test.ts` and `dependencies.test.ts`, and `sync.test.ts`: a field defined in one session reaching another (spec: defined in another session).

## 4. Docs

- [x] 4.1 Update TS-11 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.2 Run `openspec validate field-definitions --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive creates the `custom-fields` spec, and that `openspec validate --all --strict` passes.
