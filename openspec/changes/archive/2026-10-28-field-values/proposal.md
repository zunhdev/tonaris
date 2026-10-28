# Proposal

Linear: TON-50 (Feature). Implements:
- FR-03.7, fields applied per album, with applied-empty, unused and unknown kept apart;
- FR-03.8, removing a field from an album, which clears its value;
- FR-03.10, values validated by type.

Design: DS-26 (field editors), in the inspector (DS-46) and manual entry (DS-47). Done when AC-11 passes. Builds on TON-49's definitions.

## Why

Fields can be defined (TON-49) but not used: no album can carry a value yet. AC-11 is about using them: applying per album, validating by type, keeping applied-empty apart from unused, zero and No, and starting empty when a removed field is applied again.

## What Changes

- **A per-album value record,** `fieldValue {albumId, fieldId, value}`. Its presence means applied, and a null value means applied-empty. It comes in the bootstrap and on the stream.
- **Three mutations:**
  - `fieldValue.apply {albumId, fieldId}` applies a field, empty;
  - `fieldValue.set {albumId, fieldId, value}`, with `base.value`, sets or clears its value (TS-21);
  - `fieldValue.remove {albumId, fieldId}` takes the field off the album, value and all (FR-03.8).
- **Values by type** (FR-03.10):
  - text: up to 2,000 characters;
  - number: a decimal, kept exact;
  - date: `YYYY-MM-DD`, a real calendar date;
  - yes/no: true or false;
  - single choice: one of the field's options;
  - multiple choice: a set of them, no repeats.

  Anything else is refused with its reason, and the editor keeps the input.
- **The inspector's Custom fields section** (DS-46, DS-26):
  - applied fields as rows, empty ones included;
  - in Editing mode, each type's editor, a × to remove the field, and "+ Add field" with the unused fields and "Create field…";
  - a small create dialog, which TON-53's Settings reuses.
- **Manual entry** (DS-47) applies fields, with the same editors, as the album is saved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: gains per-album usage and values.

## Impact

- **`packages/domain`:**
  - `field-values.ts`: the record, the value checks, and the commands;
  - the three mutations, the `fieldValue` change, and the bootstrap's `fieldValues`;
  - the store's value methods.
- **`packages/db`:** the store's methods over `album_field_values` and `album_field_multi`, and values in the bootstrap.
- **`apps/api`:** the regenerated OpenAPI document; only additions.
- **`apps/web`:**
  - the field values collection, with its descriptions, retries and dependencies;
  - the editors, the inspector section, the create dialog, and the form's fields.
- **No schema change.**
