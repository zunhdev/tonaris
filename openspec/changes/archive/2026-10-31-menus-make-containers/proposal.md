# Proposal

Linear: TON-120 (Design). Implements FR-01.1. Design: DS-27, DS-31, DS-78. Done when each menu makes the new list or folder in its place.

## Why

In the creator's manual testing (31 October 2026), a folder's or list's ⋯ menu (TON-117) couldn't make a new list or folder there, and the "+" beside Collection made them where N would, not in Collection. The creator chose: folder and list menus make them in place, and Collection's "+" makes them at the top level.

## What Changes

- **A folder's ⋯ menu** starts with New list and New folder, made inside that folder.
- **A list's ⋯ menu** starts with them too, made beside the list, in its folder or at the top level.
- **The "+" beside Collection** makes its New list and New folder at the top level, whatever is on view, and no longer shows N and ⇧N, which make them where the focus or the view is.
- **N and ⇧N** don't change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: the "+" menu creates at the top level; folder and list menus create in place.

## Impact

- **`apps/web`:** `container-menu.tsx`, `sidebar.tsx`, `e2e/container-menu.e2e.ts`.
- **Docs:** DS-27 and DS-31 as built.
