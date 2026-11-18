## 1. Data and rules

- [x] 1.1 `profile_favorites` (migration), its purge, `maxFavorites`.
- [x] 1.2 `account.setFavorites`, app-only, own albums only.
- [x] 1.3 `GET /v1/me/favorites`; `favorites` on a person's read, for their people only, outside Trash.

## 2. The app

- [x] 2.1 Settings → Profile: the list with ↑, ↓ and Remove, and Add a favorite… with Find an album.
- [x] 2.2 A person's page: the covers, titles and artists.

## 3. Words and tests

- [x] 3.1 FR-11.16, FR-08.4 and the decision log; DS-93, DS-121; TS-135, as built in TON-297.
- [x] 3.2 Unit and store tests: the command, matching, Trash and purge.
- [x] 3.3 API tests: the person's own list, a person's favorites for their people only.
- [x] 3.4 Browser test: picking, reordering and removing in Settings, and seeing them on a person's page.
