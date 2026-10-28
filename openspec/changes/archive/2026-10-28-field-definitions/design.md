# Design

## Context

- **The tables** exist since TON-5:
  - `field_definitions`: `id`, `owner_id`, `name`, `name_key`, `type`, unique on `(owner_id, name_key)`;
  - `field_options`: `id`, `field_id`, `label`, `label_key`, `sort_key`, unique on `(field_id, label_key)`;
  - `album_field_values` and `album_field_multi`, which this change doesn't write.
- **Folders and lists** already apply X-06 with `nameKey()` and `findNameConflict()`, under the owner's write lock (TON-26).
- **Every client record** comes in the bootstrap and on the stream (TS-24).

## Goals / Non-Goals

**Goals:** the definition commands, fields on clients, and the tests TON-49 names.

**Non-Goals:**
- per-album values (TON-50);
- option changes and type changes (TON-51);
- deletion (TON-52);
- the Settings screen (TON-53);
- MCP's field tools (M9).

## Decisions

### 1. The record

```ts
CustomField = { id: uuid; name: string; type: FieldType; options: { id: uuid; label: string }[] }
```

- **Options are part of their field's record,** in `sort_key` order (bytewise). At most 100 options make it small, and a field is edited as a whole in Settings (DS-60).
- **The change** is `{entity: "field", id, op, data: CustomField | null}`. The bootstrap gains `fields`.

### 2. The mutations

```ts
field.create { id, name, type, options: { id, label }[] }   // ids: UUIDv7 from the client (TS-10)
field.rename { id, name }  base { name }
```

### 3. The rules (domain, under the lock)

- **Names and labels:**
  - they are trimmed;
  - blank: "Give the field a name." or "Give each option a label.";
  - over 200 characters: "Names can be at most 200 characters.";
  - **taken:** "'Rating' already exists. Choose another name." (`name_conflict`). Two of a create's options with one label: "Each option needs its own label." (`validation_failed`).
- **Types:** a field that isn't a choice field can't have options: "Only choice fields have options."
- **Limits:** "You've reached 50 custom fields. Delete one to add another." and "A choice field can have at most 100 options." (`limit_exceeded`).
- **Creates sent again** (FR-13.5): an existing field with the same ID and owner, and the same values, changes nothing. Different values are a conflict, and another owner's ID is `validation_failed`, as for containers.
- **Rename:** compare-and-set on `name` (TS-21). The same name changes nothing; a case-only rename is a change.
- **Sort keys:** `generateNKeysBetween()` from `fractional-indexing`, in the order given. TON-51 adds options between them.

### 4. The store

- `findField(id)`: the field with its owner and options;
- `fieldsOf(ownerId)`: the owner's fields, for names and the count;
- `insertField(field, ownerId)`: the definition and its options;
- `renameField(id, name)`: the name and its key.

### 5. The web client

- **A `fields` collection** from `snapshotCollection`: insert → `field.create`, and an update of the name → `field.rename`. Option edits come with TON-51.
- **`describeWrite()`:** "New field 'Mood'", and "Rename field 'Rating' to 'Score'".
- **`resubmit()`** makes them again.
- **`dependenciesOf()`:** a rename depends on the field's creation in the same request.

## Risks / Trade-offs

- **[Options inside the field's record]** → An option change sends the whole field. That is at most 100 short labels, and it keeps a field and its options consistent on clients.

## Migration Plan

No schema change. The new mutations, the `field` change and the bootstrap's `fields` are additive.
