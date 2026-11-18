## 1. Data and rules

- [x] 1.1 `people_hidden` (migration), its purge on account deletion, and hidden people left out of `connections`.
- [x] 1.2 `yours` and `theirs` counts on `GET /v1/people`; `GET /v1/people/{id}` with both lists.
- [x] 1.3 `share.revokePerson` and `people.remove`, app-only, with the store's `openGrantsTo` and `hidePerson`.

## 2. The pages

- [x] 2.1 People in the sidebar's places and on a phone's Shared screen.
- [x] 2.2 `/people`: rows with counts, and the field.
- [x] 2.3 `/people/{id}`: both lists, Stop sharing with its confirmation, and Remove from People, desktop-only.

## 3. Words and tests

- [x] 3.1 FR-07.24 and the decision log; DS-31, DS-121 and the routes; TS-33, as built in TON-295.
- [x] 3.2 Unit and store tests: counts, the person's lists, revoking all, hiding and coming back.
- [x] 3.3 API tests: both reads, the two commands over HTTP, app-only.
- [x] 3.4 Browser tests: the page and a person's page, Stop sharing, Remove from People, and a phone.
