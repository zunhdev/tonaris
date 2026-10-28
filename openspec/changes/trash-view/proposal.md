# Proposal

Linear: TON-59 (Design). Implements FR-01.12 and FR-01.13 in the interface: Trash as the owner's recovery area, unit by unit. Design: DS-55 (the view), DS-57 (permanent removal). Done when Trash is fully operable by keyboard, and a folder unit's contents are read-only with the reason.

## Why

TON-55 to TON-58 built deletion, units, recovery and purge, but Trash is still a placeholder page. Restoring, deleting for good and emptying Trash have no place in the app.

## What Changes

- **The Trash page** (desktop):
  - a table of units, newest first: name (an album with its artist), contents ("Folder · 6 lists, 2 folders", "List", "Album"), deletion date, expiry ("Expires in 12 days", the exact date on hover or focus, in `status.warning` under 3 days), and where it was;
  - a local "Filter by name";
  - **Empty Trash…** in the header;
  - "Trash is on the desktop app." on a narrow screen.
- **A folder's row** opens its folders and lists, nested and read-only, under "Part of 'Metal' — restore or delete the folder to act on these."
- **Per unit:**
  - **Restore**, or **R** on the row's focus, through the recovery flow (DS-56);
  - **Delete permanently…**, through the standard confirmation (DS-57).
- **The unit record gains `members`,** its folders and lists with their parents, and **`artist`,** an album's credit. Both are additive in responses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trash-and-recovery`: gains the Trash view.

## Impact

- **`packages/domain` and `packages/db`:** the unit record's `members` and `artist`.
- **`apps/api`:** the regenerated OpenAPI document; responses only.
- **`apps/web`:** `features/trash/trash-view.tsx` and its route, replacing the placeholder.
- **No schema change.**
