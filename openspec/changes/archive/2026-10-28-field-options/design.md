# Design

## Context

- **Fields** are records with their options, in `sort_key` order (TON-49). `field.create` and `field.rename` are their only writes.
- **Values** live in `album_field_values` and `album_field_multi` (TON-50). Removing an option is mostly done by the foreign keys:
  - `album_field_values.option_id` is `ON DELETE SET NULL`, so a single choice becomes applied-empty;
  - `album_field_multi.option_id` is `ON DELETE CASCADE`, so a multiple choice keeps its other selections, and its `album_field_values` row stays applied.
- **Trash** keeps an album's rows and sets `trashed_at` (TS-13). A field's usage and an option's selections therefore include albums in Trash without special handling, and recovering an album recreates nothing (X-09).
- **Scope hashes** exist for MCP approvals: `canonicalJson()` and `scopeHash()` in `approvals.ts` (TS-64).
- **Clients** receive all of the account's albums and values, Trash included, but not which albums are in Trash.

## Goals / Non-Goals

**Goals:** the four mutations, the removal scope read, the client's writes, and the tests for AC-12's option checks and AC-13.

**Non-Goals:**
- the Settings screen and its confirmation dialog (DS-60, TON-53);
- field deletion (TON-52);
- MCP's field tools and approvals (M9);
- reordering options, which no requirement asks for;
- shared-view effects in the scope. No list can be shared yet, so the scope gains them with sharing (M7).

## Decisions

### 1. The mutations

```ts
field.changeType   { id, type }                     base { type }
field.addOption    { fieldId, id, label }           // id: UUIDv7 from the client (TS-10)
field.renameOption { fieldId, optionId, label }     base { label }
field.removeOption { fieldId, optionId, scopeHash? }
```

- **New mutations,** rather than options on `field.rename`: oasdiff refuses any change to an existing request schema.
- **`field.changeType`:**
  - **The usage check** runs under the owner's lock: no `album_field_values` row for the field. The count of rows, active and in Trash, goes into the refusal: "Used by 3 albums (1 in Trash). Create a new field of the type you need instead." (`field_in_use`).
  - **Options:** they stay between choice types; a non-choice type deletes them; a choice type reached from a non-choice type starts with none.
  - **Result:** the `confirmed` outcome's `result` is `{discardedOptions: [{id, label}]}`, which MCP will report (FR-03.13).
  - **Conflicts:** a CAS mismatch on `type` is a conflict, and the same type changes nothing.
- **`field.addOption`:**
  - the label is checked like a create's;
  - another option of the field with the same key is `name_conflict`: "'Calm' already exists. Choose another label.";
  - a non-choice field is `validation_failed`: "Only choice fields have options.";
  - the 101st option is `limit_exceeded`;
  - the sort key comes after the field's last one;
  - **sent again:** the same option, ID and label, changes nothing. An ID another option already has is `validation_failed`.
- **`field.renameOption`:**
  - CAS on `label` (TS-21), with the same checks, excluding the option itself;
  - the same label changes nothing; a case-only rename is a change.
- **`field.removeOption`:** the option already gone changes nothing, as does `fieldValue.remove`'s.

### 2. The removal scope and its hash

```ts
OptionRemovalScope = {
  operation: "remove_option", fieldId, optionId,
  albums: { id, trashed }[]   // by ID
}
```

- **`scopeHash()`** gives `sha256(canonical(scope))` (TS-64). It accepts any scope, not just approvals' union.
- **The command:**
  - it computes the scope under the lock;
  - with no album, it removes the option;
  - otherwise it removes it only if `args.scopeHash` matches. A missing hash is refused: "'Calm' is chosen on 3 albums (1 in Trash). Confirm removing it from them." A different hash is refused: "The albums choosing 'Calm' changed since you confirmed. Review the change and confirm again." Both are `field_in_use`.
- **The changes:** the field's, and one `fieldValue` update per album that chose the option, with its new value.
- **The read:** `GET /v1/fields/{fieldId}/options/{optionId}/removal` returns `{field: {id, name}, option: {id, label}, albums, inTrash, scopeHash}`.
  - `albums` counts the active albums and `inTrash` the trashed ones.
  - The album IDs stay on the server: only their hash leaves.
  - Another account's field, and a missing field or option, are `not_found`.

### 3. The store

- `fieldUsage(fieldId): {active, trashed}`: counts for the type-change refusal;
- `optionUsers(fieldId, optionId): {id, trashed}[]`: the removal scope;
- `optionOwner(optionId): fieldId | undefined`: for an added option's ID;
- `lastOptionKey(fieldId)`;
- `changeFieldType(fieldId, type, discardOptions)`;
- `insertFieldOption(fieldId, option, sortKey)`;
- `renameFieldOption(optionId, label)`;
- `removeFieldOption(fieldId, optionId, albumIds): FieldValue[]`: deletes the option, then reads back the affected albums' values.

### 4. The web client

- **The fields collection's update** sends, in this order:
  - a rename;
  - a type change;
  - the options removed, renamed, then added, so that a label freed by a removal can be reused in the same update.
- **Removals:** each carries the hash in `metadata.confirmed[optionId]` of `fields.update(id, {metadata}, …)`. Without a hash, the server refuses a used option, and the failure shows as usual.
- **`dependenciesOf()`:**
  - a field's creation also creates its options' IDs, and `field.addOption` creates one;
  - the other option writes reference the field and the option.
- **`describeWrite()`:**
  - "Change 'Mood' to Text";
  - "Add option 'Calm' to 'Mood'";
  - "Rename option 'Calm' to 'Quiet'";
  - "Remove option 'Calm' from 'Mood'".
- **`resubmit()`** plans field updates, removals carrying their hashes.

## Risks / Trade-offs

- **[The hash names albums the client can't list]** → The client only shows counts. A hash computed by the server and returned by the read is enough to confirm exactly that scope.
- **[Optimism on removal]** → The option leaves the client's field at once. Values still naming it until the server's changes arrive show without the label, briefly.

## Migration Plan

No schema change. The mutations, the result and the route are additive.
