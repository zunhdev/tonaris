# Proposal

Linear: TON-184 (Design). Adjusts DS-110's phone rows for folders and lists (DS-41), as built in TON-103 and TON-156. Done when, on a phone, a folder or list row shows its name across the full width with its count on a second line under it, the whole row opens it, and desktop rows are unchanged.

## Why

In manual testing on Android on 9 November 2026, the creator found a folder's rows hard to read. Each row had two columns: the name, and the count, "22 folders and lists". The count's column is as wide as its text, so it took almost half the screen and cut names like "Независимая сцена …" short. The creator proposed moving the count to a small second line under the name.

## What Changes

- **Below 768 px, a folder or list row has two lines.**
  - The first line has the icon, the name and its save state, across the full width.
  - The second line has the count, "22 folders and lists" or "9 albums", in `text.small` `fg.tertiary`. A description's first line follows it after " · ", instead of following the name.
- **The row is one cell, and all of it is the link,** so a tap anywhere on it opens the folder or list. The second line is the link's description, so the link is still named by the folder's or list's name.
- **Rows are 56 px,** the same as album rows, up from 48 px.
- Desktop rows keep their columns. Cards don't change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-web`: a phone's folder and list rows put the count under the name.

## Impact

- **`apps/web`:** `features/collection/container-rows.tsx`, and the phone test in `e2e/mobile.e2e.ts`.
- **Docs:** DS-110 and DS-41 as built.
- No API, data or sync change.
