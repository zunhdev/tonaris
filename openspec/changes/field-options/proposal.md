# Proposal

Linear: TON-51 (Feature). Implements:
- FR-03.12, changing a field's type only while no album uses it;
- FR-03.13, options on a type change;
- FR-03.14 to FR-03.16, adding and renaming options, with labels unique per field;
- FR-03.17, removing options, confirmed when used (X-07);
- X-09, these changes reaching albums in Trash.

Tech: TS-14. Done when AC-12's option checks and AC-13 pass. Builds on TON-49's definitions and TON-50's values. The Settings screen that uses these changes (DS-60) is TON-53.

## Why

A field's definition is fixed once it is created: its options can't grow, be renamed or go, and its type can't change. AC-12 and AC-13 are about changing them safely:
- a used field's type stays as it is;
- options keep their selections when renamed;
- removing a used option is confirmed for its exact scope, Trash included.

## What Changes

- **Four mutations:**
  - `field.changeType {id, type}`, with `base.type`. It is allowed only while no album, in Trash or not, applies the field, even empty. Otherwise it is refused with `field_in_use`, naming the usage and suggesting a new field. Between single and multiple choice it keeps the options; to any other type it discards them and reports which.
  - `field.addOption {fieldId, id, label}` adds an option at the end.
  - `field.renameOption {fieldId, optionId, label}`, with `base.label`, keeps the option and its selections.
  - `field.removeOption {fieldId, optionId, scopeHash?}` removes an option.
    - An unused one is removed outright.
    - A used one needs the hash of its removal scope, the albums choosing it, as the server computes it in the same transaction (TS-14, TS-64); otherwise it is refused with `field_in_use`.
    - Removal clears it everywhere: a single choice becomes empty, and a multiple choice keeps its other selections.
- **A read of the removal scope:** `GET /v1/fields/{fieldId}/options/{optionId}/removal` gives the field, the option, the albums choosing it, active and in Trash, and the scope hash that confirms it. The confirmation dialog shows these (DS-60, TON-53).
- **The web client** sends these from the fields collection: the type, and the options added, renamed and removed. A removal carries its confirmed hash in the update's metadata.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: gains type changes and the option lifecycle.

## Impact

- **`packages/domain`:**
  - `field-options.ts`: the commands and the removal scope;
  - the four mutations;
  - the store's usage and option methods.
- **`packages/db`:** the store's methods, and the removal scope read.
- **`apps/api`:** the removal route and the regenerated OpenAPI document; only additions.
- **`apps/web`:** the fields collection's option and type writes, with their descriptions, retries and dependencies.
- **No schema change.**
