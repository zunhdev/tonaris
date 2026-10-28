# Design

## Context

- **Every operation exists:**
  - `fields.insert`, `fields.update` (name, type, options) and `fields.delete` on the client;
  - the removal and deletion reads for confirmations (TON-51, TON-52).
- **Clients hold** every field and value, Trash included, but not which albums are in Trash: Trash arrives in M5.
- **Settings pages** use `PageHeader`, then `SettingsNav`, then their content (TON-35). The create dialog exists (TON-50).
- **No DS-28 dialog exists yet;** the sign-out dialog uses `AlertDialog` directly.

## Goals / Non-Goals

**Goals:** DS-60's page, DS-28's dialog, and the usage read.

**Non-Goals:**
- shared-view effects in the dialogs, which come with sharing (M7);
- reordering options, which no requirement asks for.

## Decisions

### 1. The usage read

`GET /v1/fields/usage` returns `{fields: [{fieldId, albums, inTrash}]}`, every field of the account, counted by `album_field_values` rows joined to `albums`.
- **When the page reads it:** on opening, and again whenever the client's values or fields change, so another session's change shows. A failed read leaves the column showing "—".
- **The type select's lock** uses the same counts. The server still refuses a used field's type change.

### 2. The page

- **The table** is a list of rows, each a disclosure button with `aria-expanded`. It shows the name, the type, "3 options" (choice types only), and the usage. The edit panel opens below the row.
- **Name:** an input that saves on Enter or when left; Escape reverts. Problems show inline, with the server's words: `fieldNameProblem`, `fieldNameTaken`.
- **Type:** a select. Choosing a type saves it, except from a choice type to another type, which shows "Changing to Text discards its options: Calm, Loud." with **Change type** and **Keep options**.
- **Options:**
  - each label is an input, saved like the name;
  - × "Remove {label}" reads the removal: with no album it removes at once; otherwise it opens the dialog;
  - an "Add option" input with a button adds one, cleared after, and checked like a label.
- **Delete field** reads the deletion, then opens the dialog.
- **Limits:** **New field** is disabled at 50 fields, with the reason beside it. The add-option row disappears at 100 options.

### 3. The confirmation dialog (DS-28)

`ConfirmDialog {title, scope: ReactNode[], consequences: string[], action, onConfirm}`, on `AlertDialog`:
- Cancel has the focus;
- the action button uses the danger variant, as both operations are irreversible;
- while the write is sent, it shows nothing more; the save-state layer reports a failure.

**The words:**
- **Removing an option:**
  - title "Remove option 'Calm'?";
  - scope "Chosen on 12 albums" and "3 of them in Trash" (when any), in "Mood";
  - consequences "It's cleared from those albums; other options stay." and "This can't be undone.";
  - action "Remove from 12 albums".
- **Deleting a field:**
  - title "Delete field 'Mood'?";
  - scope "The field and its 3 options: Calm, Loud, Odd" and "Values on 214 albums, 3 of them in Trash";
  - consequences "This can't be undone — Trash and album restore won't bring it back.";
  - action "Delete field".

## Risks / Trade-offs

- **[Usage read lag]** → Counts follow a moment after another session's change. The server checks every guarded write, so a stale count can't let a wrong change through.

## Migration Plan

No schema change. The route is additive.
