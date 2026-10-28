# Tasks

## 1. Domain

- [x] 1.1 Add `field-values.ts` with the record, the value checks and the three commands; the mutations, change and bootstrap field; and the store's methods in `memoryStore` (design decisions 1 and 2). Verify with `field-values.test.ts`:
  - applied-empty for each type (specs: applied but empty; yes, No and empty);
  - removed and applied again (spec: removed and applied again);
  - every type's valid and invalid values (specs: not a number; not a calendar date; another field's option; a repeated option);
  - a conflict (spec: changed elsewhere);
  - someone else's album or field, and a set on an unused field.

## 2. Database

- [x] 2.1 Implement the store's value methods and values in the bootstrap. Verify with `field-values.test.ts` against Postgres: each type stored in its column and read back, multiple choice in option order, removal cascading its selections, and the bootstrap.

## 3. Web

- [x] 3.1 Add the field values collection, descriptions, retries and dependencies; regenerate the OpenAPI document (design decision 3). Verify with unit tests and `sync.test.ts`: a value set in one session reaching another.
- [x] 3.2 Add the editors, the inspector section, the create dialog and manual entry's fields (design decision 3). Verify with Playwright (`custom-fields.e2e.ts`):
  - creating a field from "+ Add field";
  - applied-empty shown as "Empty" and `—`;
  - a refused number keeping its input;
  - each type's value saved and shown after a reload;
  - a removed field coming back empty;
  - manual entry with fields (AC-11).

## 4. Docs

- [x] 4.1 Update DS-26, DS-46, DS-47, TS-11 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 5. Checks

- [ ] 5.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [ ] 5.2 Run `openspec validate field-values --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `custom-fields`, and that `openspec validate --all --strict` passes.
