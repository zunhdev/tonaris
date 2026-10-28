# Design

## Context

- **The foreign keys cascade:** deleting a `field_definitions` row deletes its `field_options`, `album_field_values` and `album_field_multi` rows (TS-11). No other table refers to a field: views don't, and Trash keeps an album's rows in place rather than a copy (TS-13). Deleting the row is therefore permanent for albums in Trash too.
- **TON-51** confirms a chosen option's removal with a scope hash: a read gives the counts and the hash, and the command recomputes the scope under the lock. Deletion follows it.

## Goals / Non-Goals

**Goals:** the mutation, the deletion read, the client's deletes, and AC-12's deletion checks.

**Non-Goals:**
- the Settings screen and its dialog (TON-53);
- MCP's field tools (M9);
- shared-view effects, which join the scope with sharing (M7), as for option removal.

## Decisions

### 1. The mutation and its scope

```ts
field.delete { id, scopeHash }       // scopeHash required: deletion is always confirmed

FieldDeletionScope = {
  operation: "delete_field", fieldId, name, type,
  options: { id, label }[],        // in order
  albums: { id, trashed }[]        // by ID
}
```

- **The scope's contents:**
  - the name, type and options are included, so a rename, a type change or a new option after confirming makes the hash stale;
  - so does any album applying or leaving the field.
- **Refusals:**
  - a stale hash: "'Mood' changed since you confirmed. Review the deletion and confirm again." (`field_in_use`, as for option removal);
  - someone else's field: `not_found`, like a missing one.
- **Already gone:** a field already deleted changes nothing, so a retried deletion succeeds.
- **The changes:** a `field` delete, and a `fieldValue` delete for each album that applied it, so every client drops them.

### 2. The read

`GET /v1/fields/{fieldId}/deletion` returns `{field: {id, name, type}, options: [{id, label}], albums, inTrash, scopeHash}`, the counts only. Another account's field and a missing one are `not_found`.

### 3. The store

- `fieldUsers(fieldId): {id, trashed}[]`: the albums applying it;
- `deleteField(fieldId)`: deletes the row, and the cascade does the rest.

TON-51's `fieldUsage` counts stay for the type change.

### 4. The web client

- **The fields collection's `onDelete`** sends `field.delete`, with the hash from `metadata.confirmed` of `fields.delete(id, {metadata: {confirmed: hash}})`. Without a hash, the server refuses the deletion as invalid input, and the failure shows as usual.
- **Optimism:** the field leaves the client at once. Its values hide with it, as albums show only fields that exist, until the server's deletes arrive.
- **Descriptions:** "Delete field 'Mood'".
- **Dependencies:** it references the field.
- **Retries:** a retry deletes the field again, with its hash.

## Risks / Trade-offs

- **[A change per album]** → Deleting a field used by 10,000 albums logs 10,001 changes. That is rare and bounded by the collection's size, and it keeps every client consistent without a special case.

## Migration Plan

No schema change. The mutation and the route are additive.
