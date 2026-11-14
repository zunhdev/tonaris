# Proposal

## Why

Three confirmations the specs promise don't say what an action does to sharing. A move applies at once, before its sharing preview arrives, with no confirmation (DS-49, FR-07.14). Deleting a folder doesn't say its sharing stops while it's in Trash (DS-28, DS-50). Removing a used option or deleting a field doesn't name the effect on shared views (FR-03.17, FR-03.18). The creator decided on 14 November 2026 to build all three (TON-225: DRIFT-070, DRIFT-076, DRIFT-092). Linear: TON-226.

## What Changes

- **Moves.** Move to… and dropping onto the tree read the move's sharing effect first. When someone would newly see it or stop seeing it (or, for an editor, when who sees it changes), a confirmation "Move '{name}' to '{destination}'?" lists the change, with Move and Cancel focused. When nothing changes, the move applies at once. When the effect can't be read, the confirmation says so.
- **Deleting a folder.** When the folder, something inside it, or a folder above it is shared, its confirmation adds that, while it's in Trash, the people it's shared with or anyone with a link to it can't open it or anything inside, and that recovering it gives them access again.
- **Removing a used option, deleting a field.** The removal and deletion reads count how many of the affected albums outside Trash are in what the owner shares. The confirmations then say that the people they share them with stop seeing the option or the field on them. AI clients' approvals say the same.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: moves that change who sees what are confirmed; deleting a shared folder says its sharing pauses.
- `custom-fields`: removals name their effect on shared albums.
