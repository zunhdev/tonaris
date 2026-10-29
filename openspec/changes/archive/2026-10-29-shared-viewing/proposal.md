# Proposal

Linear: TON-69 (Feature). Implements FR-07.17, FR-05.2 for shared content, and FR-07.11 for signed-in viewers. Design: DS-70. Done when a viewer's presentation never affects the owner and AC-16's shared part passes.

## Why

Signed-in people can keep shared folders and lists (TON-68) but can't open them in the app. DS-70 gives them the same shell, view-only: a pill naming the owner, no edit controls, and their own sorting, grouping, layout and arrangement, synced like their own views and never touching the owner's.

## What Changes

- **Personal presentation of shared content** (FR-07.17, FR-05.2, AC-16):
  - `view.set` and `order.set` accept a shared folder or list the person may read, as well as their own. The choices are the person's own records, keyed by that folder or list, synced through their change log.
  - The owner's choices are never read or changed.
  - Account defaults apply to shared views not visited yet, and remembered choices win.
- **`GET /v1/shared/{id}`:** a folder or list the person may read through sharing, as TON-64's snapshot, with artwork signed; 404 otherwise.
- **`GET /v1/shared/{id}/stream`:** `shared-invalidate` after each of the owner's saves, as guests get (TON-70). The page re-reads, and shows "No longer available" when access ends.
- **`/shared/{id}`** (DS-70), in the workspace shell:
  - **The header:** the name, a "View only · Shared by {name}" pill, and View options (sort, direction, grouping, layout), saved for the person. No mode toggle, Share or delete.
  - **A folder:** breadcrumbs inside the share and its folders and lists, opening with `?c=`.
  - **A list:** albums as rows or a grid, with each album's Open chooser.
  - **Manual order** shows the person's own arrangement. On the desktop, ⌥↑ and ⌥↓ (with ⇧ for the ends) move the focused row in it (DS-49).
- **Shared with me's entries** open their page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: signed-in viewers open shared content in the app, with their own presentation.

## Impact

- **`packages/domain`:** `viewKindOf` accepts readable shared containers through a new store method.
- **`packages/db`:** that method, and `viewItems` for shared folders.
- **`apps/api`:** two routes, and OpenAPI (two paths).
- **`apps/web`:** the `/shared/$containerId` route and `features/sharing/shared-view.tsx`, reusing the guest page's album and folder rendering; links from `/shared`.
- **No schema change.**
