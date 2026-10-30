# Proposal

Linear: TON-107 (Design). Design: DS-13, DS-30. Implements FR-01.3's breadcrumbs and heading, as they look. Done when desktop headers show the view's name at 13 px, and the design spec and the app-shell spec say so.

## Why

In end-product testing (30 October 2026), the creator found the view's name in the desktop header too large. It was 20 px semibold (`text.page`), next to 13 px breadcrumbs. They chose the breadcrumbs' size, set apart by weight and colour, as in Linear.

## What Changes

- **The desktop header's name:** `text.base` (13 px), medium weight, `fg.primary`, after the `fg.secondary` breadcrumbs.
- **Where:** every desktop page header, including folders, lists, Unsorted, Trash, Shared with me, Settings and Admin.
- **Unchanged:** the phone's top bar keeps `text.title` (DS-110), and full-page messages such as "Not available" keep `text.page`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the view's name in the desktop header is the breadcrumbs' size, set apart by weight and colour.

## Impact

- **`apps/web`:** `features/shell/page-header.tsx`.
- **Tests:** `e2e/collection-navigation.e2e.ts`.
- **Docs:** DS-13's `text.page` row and DS-30 as built.
- **No API change.**
