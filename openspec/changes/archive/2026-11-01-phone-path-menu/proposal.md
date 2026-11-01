# Proposal

Linear: TON-153 (Design). Implements section 2.2's mobile browsing. Design: DS-30, DS-110. Done when a phone reaches Collection and any folder above from the top bar's name, in own and shared views.

## Why

In the creator's manual testing (1 November 2026), a phone had no quick way back to the root of the collection: Back climbs one level at a time. On the desktop, the breadcrumbs and the logo do it.

## What Changes

- **The top bar's name shows the path** (the creator chose this over a Home button in the bar, a breadcrumb row under it, or a long press on Back, 1 November 2026). Two or more levels deep, the name gets a chevron and becomes a button. Tapping it opens a menu of the views above, Collection first, then each folder down to the one Back goes to. Choosing one goes there.
- **One level deep, the name stays plain** (the creator chose this, 1 November 2026): the menu would only repeat Back.
- **Shared views** list Collection (on Shared), then the share's folders above.
- **The phone's menus get a `touch` size**, 44 px items, which the account menu (TON-152) and the path menu share. Desktop doesn't change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-web`: the top bar's name opens the path.

## Impact

- **`packages/ui`:** `DropdownMenuContent` gains a `touch` size.
- **`apps/web`:** `page-header.tsx` (the path menu; `path` replaces `back`), its callers in `views.tsx`, `shared-view.tsx`, `section-frame.tsx`, `invitations.tsx`, `shared-with-me.tsx`, `trash-view.tsx`; `account-menu.tsx`; `e2e/mobile.e2e.ts`.
- **Docs:** DS-110 as built.
