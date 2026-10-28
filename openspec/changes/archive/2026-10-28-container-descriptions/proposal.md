# Proposal

Linear: TON-54 (Feature). Implements:
- FR-03.5, optional plain-text descriptions of folders and lists, editable by the owner, kept through moves and Trash;
- FR-12.4, search not matching them.

Design: DS-41 (the description excerpt in rows). Done when AC-03's description checks pass.

## Why

`containers.description` has existed since TON-5, but nothing reads or writes it. AC-03 asks that descriptions be:
- editable;
- visible live;
- kept through moves and recovery;
- not searched.

## What Changes

- **The container record gains `description`,** null for none, in the bootstrap and on the stream. `container.create`'s arguments stay as they are, as oasdiff refuses changes to an existing request; a new folder or list has none.
- **`container.describe {id, description}`,** with `base.description`, sets or clears a description:
  - plain text, trimmed, with empty text clearing it;
  - at most 2,000 characters (TS-18): "Descriptions can be at most 2,000 characters.";
  - not in Trash, like a rename.
- **The web:**
  - **Viewing mode:** a folder or list shows its description under the header.
  - **Editing mode:** the description is a text box, "Add a description", saved on Enter or when left; Shift+Enter adds a line.
  - **Rows (DS-41):** a folder's rows show each child's first line after the name, as the link's accessible description.
  - **The containers collection** sends `container.describe`, and a new folder or list with a description is created, then described.
- **Search** stays on names and titles (FR-12.4); a test pins it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: gains descriptions.

## Impact

- **`packages/domain`:**
  - the record split (`containerFieldsSchema` for creates, `containerSchema` with the description);
  - the command and the mutation;
  - the limit.
- **`packages/db`:** descriptions in the bootstrap and the store; the column exists.
- **`apps/api`:** the regenerated OpenAPI document. Requests only gain `container.describe`; responses gain the field.
- **`apps/web`:**
  - the description under the header, and the row excerpt;
  - the collection's writes, descriptions, retries and dependencies.
- **No schema change.**
