# Tasks

## 1. Usage read

- [x] 1.1 Add the usage schema, its database read and the route, and regenerate the OpenAPI document; only additions (design decision 1). Verify with the API's tests: counts with Trash, and only the account's fields.

## 2. Web

- [x] 2.1 Add the confirmation dialog (design decision 3), the Custom fields page, its route and subnav link (design decision 2). Verify with Playwright by keyboard (`custom-fields-settings.e2e.ts`):
  - creating;
  - renaming, with a name in use refused inline;
  - the type locked for a used field;
  - discarding options on a type change;
  - adding, renaming and removing options, an unused one at once and a used one confirmed;
  - deleting through the dialog.

## 3. Docs

- [x] 3.1 Update DS-28, DS-60, DS-92 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
