# Proposal

Linear: TON-53 (Design). Implements DS-60, Settings → Custom fields, over FR-03.6 to FR-03.18, with DS-28's confirmation dialog for the confirmed operations (X-07). Done when every field operation is available from Settings and works by keyboard. Builds on TON-49 to TON-52, which made each operation available to clients.

## Why

Fields can be defined and applied from the inspector, but renaming them, changing types, managing options and deleting them have no place in the app. DS-60 puts them in one Settings page.

## What Changes

- **A Custom fields page** in Settings, between Preferences and Connections (DS-92):
  - a table of fields: name, type, option count, and usage ("Used by 214 albums · 3 in Trash", or "Unused");
  - a "New field" button opening TON-50's create dialog.
- **Each row's edit panel,** opened from the row:
  - **Name:** renamed inline, with uniqueness errors inline (X-06).
  - **Type:** a select.
    - For a used field it is disabled, with "Used by 214 albums (3 in Trash). Create a new field of the type you need instead." and a **Create new field** button.
    - A change from a choice type to another type first lists the options it discards, and needs **Change type** to go ahead.
  - **Options:** renamed inline, added, and removed with ×. An unused option goes at once; a used one opens the confirmation.
  - **Delete field,** always through the confirmation.
- **The standard confirmation dialog** (DS-28): a title naming the verb and target, a scope block with counts, a consequences block, and Cancel with the focus beside a danger button naming the action. Its counts come from the removal and deletion reads, and its button sends their hash.
- **A usage read,** `GET /v1/fields/usage`: each field's albums, active and in Trash. Clients don't know which albums are in Trash.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: gains the Settings page.

## Impact

- **`packages/domain`:** the usage read's schema.
- **`packages/db`:** the usage read.
- **`apps/api`:** the usage route and the regenerated OpenAPI document; only additions.
- **`apps/web`:**
  - the Settings page and its route;
  - the confirmation dialog;
  - the subnav;
  - an end-to-end test by keyboard.
- **No schema change.**
