# Proposal

Linear: TON-71 (Design). Implements FR-07.9's and FR-07.14's previews for moves and recovery. Design: DS-69. Done when AC-21's previews for moves and recovery are verified.

## Why

Moving a folder or list changes who inherits access to it (FR-07.9), and recovering one from Trash resumes its sharing (FR-07.10). FR-07.14 wants the owner to see those consequences on the desktop before they apply, never implying content becomes private while another access path remains. Today a move or recovery just happens.

## What Changes

- **The impact rules** (FR-07.9, FR-07.10), pure, in `packages/domain`:
  - **A move:** who newly sees the item, through the destination's folders; who no longer sees it, through the folders it leaves; and the direct shares it and its contents keep.
  - **A folder's or list's recovery:** the destination's audiences, and the unit's own shares, which resume.
  - **An album's recovery:** the audiences of the active lists it returns to.
  - **Audiences** are people with accepted or pending invitations, by display name or the address as typed, and links, by the folder or list they share.
  - Nobody is named as losing access while another path keeps it.
- **`GET /v1/sharing/impact`:** the owner's preview of one move (`move`, `to`) or one recovery (`recover`, `to`), read-only.
- **`SharingImpact`** (DS-69): a compact block, with these lines:
  - "Newly visible to …";
  - "No longer visible through '{folder}': …";
  - "Still shared directly with …";
  - "Sharing unchanged".
- **Where it shows:**
  - **Move to…:** for the destination with the focus or the pointer, before choosing.
  - **Dragging** a folder or list over the tree: under the dragged item's name, for the folder it's over.
  - **Recovery:**
    - a recovery that would make content visible to anyone asks first, "Restore '{name}'?", with the block;
    - the destination prompt shows it for the destination with the focus;
    - an Undo right after deleting doesn't ask.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: moves and recovery preview their sharing consequences.

## Impact

- **`packages/domain`:** `sharing-impact.ts`, with tests, including a property against the access rules.
- **`packages/db`:** the state the rules read.
- **`apps/api`:** one route, and OpenAPI (one path).
- **`apps/web`:**
  - the `SharingImpact` block and its read;
  - the move dialog;
  - the drag overlay;
  - recovery.
- **No schema change.** MCP's move and recovery tools come with M9 and will report the same impact.
