# Design

## Context

- **`containers.description`** exists (TS-11), unread.
- **`containerSchema`** is the client record, and also the base of `container.create`'s arguments. A field added to it would change that request, which oasdiff refuses. TON-48 split the album record from `album.create`'s arguments in the same way.
- **Editing mode** shows edit chrome, and leaving it commits open editors (DS-45).

## Goals / Non-Goals

**Goals:** the record, the mutation, the header and row display, and AC-03's description checks.

**Non-Goals:**
- MCP's `set_description` and descriptions in its outputs (M9);
- sharing viewers (M7);
- the export (FR-08).

## Decisions

### 1. The record split

- **`containerFieldsSchema`** `{id, kind, parentId, name}` keeps `container.create`'s arguments byte-identical.
- **`containerSchema`** extends it with `description: string | null`, and `Container` is that record.
- **A create** saves no description: `createContainer` sets null.

### 2. `container.describe`

- **The shape:** `{id, description: string | null}`, with `base: {description}`.
- **Like `container.rename`:** missing, someone else's or in Trash is refused, and a CAS mismatch is a conflict.
- **Text:** trimmed; empty means null; over 2,000 code points is `validation_failed`.

### 3. The web

- **`ContainerDescription`** under `ViewHeader` for folders and lists:
  - **Viewing mode:** the text, line breaks kept, scrolling past about four lines; nothing when there is none.
  - **Editing mode:** a borderless text box, labelled "Description" for assistive technology. Its rules: Enter saves, Shift+Enter adds a line, Escape reverts, leaving it or Editing mode saves, and an error stays with its reason.
- **Rows:** the first line, `fg.tertiary`, truncated, after the link. The name keeps at most 60% of the cell, so a long name still leaves room. The link points to it with `aria-describedby`, so its accessible name stays the name.
- **Writes:**
  - **The collection's update** adds `container.describe` beside rename and move.
  - **Its insert** sends `container.create`, then `container.describe` when the new row has a description, in the same request (the describe depends on the create).
- **Descriptions, retries, dependencies:** "Describe the list 'Later'", "Clear the description of the list 'Later'"; it references the container.

## Risks / Trade-offs

- **[Excerpt width]** → A long description truncates to one line. Its page shows it whole.

## Migration Plan

No schema change. The mutation is additive, and the record's new field is additive in responses.
