# Tasks

## 1. Domain

- [x] 1.1 Add the command, the deletion scope and the mutation, and the store's methods in `memoryStore` (design decisions 1 and 3). Verify with `field-deletion.test.ts`:
  - unused and confirmed;
  - used, Trash included;
  - a stale hash after an album applies the field or an option is added;
  - someone else's field;
  - already deleted;
  - the name reused.

## 2. Database

- [x] 2.1 Implement the store's methods and the deletion read. Verify with `field-deletion.test.ts` against Postgres:
  - the cascade, in Trash too;
  - recovery from Trash bringing nothing back;
  - the bootstrap.

## 3. API and web

- [x] 3.1 Add the deletion route (design decision 2) and regenerate the OpenAPI document; only additions. Verify with the API's tests: the scope, its hash confirming the deletion, and another account's field.
- [x] 3.2 Delete from the fields collection, with descriptions, retries and dependencies (design decision 4). Verify with unit tests and `sync.test.ts`: a deletion in one session reaching another, with its values.

## 4. Docs

- [x] 4.1 Update TS-14 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check` and the OpenAPI comparison with main.
