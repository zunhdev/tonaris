# Tasks

## 1. Domain

- [x] 1.1 Add `field-options.ts` with the four commands and the removal scope; the mutations; and the store's methods in `memoryStore` (design decisions 1 to 3). Verify with `field-options.test.ts`:
  - type changes: used, empty or in Trash; unused; options kept, discarded and reported, and not restored;
  - adding and renaming: labels in use, case-only, limits, non-choice fields, sending again, conflicts;
  - removing: unused; used without a hash; with a stale hash; confirmed, for single and multiple choice; in Trash; a removed label added again.

## 2. Database

- [x] 2.1 Implement the store's methods and the removal scope read. Verify with `field-options.test.ts` against Postgres:
  - the type change refused for a trashed album's usage;
  - a confirmed removal clearing single and multiple choices, in Trash too;
  - recovery from Trash not bringing it back.

## 3. API and web

- [x] 3.1 Add the removal route (design decision 2) and regenerate the OpenAPI document; only additions. Verify with the API's tests: the scope and its hash, another account's field, and a removal confirmed with the returned hash.
- [x] 3.2 Send type and option changes from the fields collection, with descriptions, retries and dependencies (design decision 4). Verify with unit tests and `sync.test.ts`: options added, renamed and removed in one session reaching another.

## 4. Docs

- [x] 4.1 Update TS-14, TS-11 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 5. Checks

- [ ] 5.1 Run `bun run check` and the OpenAPI comparison with main.
