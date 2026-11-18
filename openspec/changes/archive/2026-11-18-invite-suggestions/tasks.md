## 1. Data and rules

- [x] 1.1 `share_grants.accepted_at`, set on accept and backfilled; `invited_email` nullable (migration).
- [x] 1.2 The people read (`packages/db/src/people.ts`) and the store's `findPerson`, with the in-memory store's.
- [x] 1.3 `share.invite` with `personId`, refused as an unregistered address for anyone else.
- [x] 1.4 `GET /v1/people`; the dialog's settings give each invitation's `personId`, and its address may be null.

## 2. The dialog

- [x] 2.1 `people-picker.ts`: suggestions, matches and clashing names.
- [x] 2.2 The invite field's combobox, inviting a chosen person at once; rows and previews without an address.

## 3. Words and tests

- [x] 3.1 FR-07.4, FR-07.23 and the decision log; DS-65 and DS-69; TS-33, as built in TON-294.
- [x] 3.2 Unit and store tests: who counts each way, deleted accounts, order, the typed address, `sharesWithYou`, `findPerson`, inviting by person and a stranger's id.
- [x] 3.3 API tests: `GET /v1/people` and inviting by person over HTTP.
- [x] 3.4 Browser test: suggestions before typing, found by typing, chosen to invite, and a share back by name only.
