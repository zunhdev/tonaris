# Design

## Context

- **`album_field_values`** (TS-11): a row means applied; every value column null means applied-empty; no row means unused. At most one value column is set, matching the type, which the command checks. `album_field_multi` holds multiple-choice selections, cascading from their row.
- **Fields on clients** since TON-49: `{id, name, type, options}`.
- **The inspector** shows "Custom fields arrive in a later version." (TON-38), and so does manual entry.

## Goals / Non-Goals

**Goals:** AC-11, with DS-26's editors in the inspector and manual entry.

**Non-Goals:**
- option and type changes (TON-51);
- field deletion (TON-52);
- Settings (TON-53);
- custom fields in rows, cards, sorting or search (not in DS-21; search is M6);
- MCP (M9).

## Decisions

### 1. The record and its value

```ts
FieldValue = { albumId; fieldId; value: string | boolean | string[] | null }
key: `${albumId}:${fieldId}`
```

| Type | `value` | Stored in |
| --- | --- | --- |
| text | string, trimmed, 1–2,000 characters | `text_value` |
| number | decimal string, kept exact: `-?digits[.digits]` | `number_value` (numeric) |
| date | `YYYY-MM-DD`, a real calendar date | `date_value` |
| yes/no | `true` or `false` | `bool_value` |
| single choice | an option ID of the field | `option_id` |
| multiple choice | option IDs, no repeats, in the field's option order | `album_field_multi` |

- **`null` is applied-empty.** An empty text and an empty selection are stored as `null` too.
- **`fieldValueProblem(field, value)`** gives the reason a value is refused, and `normalizedValue()` the stored form. Both live in the domain, so editors check before sending, with the same words:
  - "Enter a number, such as 4.5.";
  - "Enter a date as YYYY-MM-DD, such as 2026-10-28.";
  - "Choose one of the field's options.";
  - "Choose each option once.";
  - "Text can be at most 2,000 characters."

### 2. The mutations

```ts
fieldValue.apply  { albumId, fieldId }                 // applied-empty; already applied changes nothing
fieldValue.set    { albumId, fieldId, value }  base { value }
fieldValue.remove { albumId, fieldId }                 // already unused changes nothing
```

- **The album and the field** must be the principal's (`not_found`, `permission_denied`). A trashed album's values stay as they are, as its fields do.
- **`fieldValue.set` on an unused field** is `not_found` ("This field isn't on this album."): applying is its own, explicit step (FR-03.7).
- **Compare-and-set** (TS-21): the stored value must equal `base.value`, multiple choice as a set. Otherwise it is a conflict on the field `value`.

### 3. The web client

- **A `fieldValues` collection,** from `snapshotCollection`:
  - an insert is `fieldValue.apply`, followed by `fieldValue.set` in the same request when it has a value, as an album with artwork does;
  - an update is `fieldValue.set`, and a delete is `fieldValue.remove`.
- **Editors** (`features/collection/field-editors.tsx`), per DS-26:
  - **text:** a single line, growing to multiple lines with Shift+Enter;
  - **number:** a decimal input, with no grouping;
  - **date:** text `YYYY-MM-DD`, with a "Pick a date" button that opens the browser's own calendar;
  - **yes/no:** `Yes · No · —`;
  - **single choice:** a select with "Clear";
  - **multiple choice:** the options chosen, as chips with ×, and an "Add option" select of the rest.

  Text, number and date save on Enter or when left, and Escape discards. A refused value stays with its reason. The others save as chosen.
- **The inspector's Custom fields section:**
  - **Viewing mode:** each applied field, by name, with its value, or "Empty".
  - **Editing mode:** the editors, a × "Remove {field}" per row, and "+ Add field". The menu lists the unused fields, then "Create field…".
- **The create dialog** ("New field"): name, type, and for choice types an options list. Saving defines the field and, from "+ Add field", applies it. TON-53 reuses it.
- **Manual entry:** "Custom fields" with "+ Add field", the editors, and × per row. Saving inserts the applied fields after the album, and refusals join the form's summary.

## Risks / Trade-offs

- **[A field's values when its type changes]** → Type changes are allowed only while the field is unused (TON-51), so a stored value always matches its field's type.
- **[A choice value whose option is removed]** → TON-51 clears it, with confirmation. Until then options can't be removed.

## Migration Plan

No schema change. The three mutations, the `fieldValue` change and the bootstrap's `fieldValues` are additive.
