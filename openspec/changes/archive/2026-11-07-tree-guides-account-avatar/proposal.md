# Proposal

Linear: TON-169 (Design). Implements Q-10's experience direction in the sidebar's tree (DS-27) and account menu (DS-31). Done when the tree draws guide lines under its open folders, and the account menu shows a round avatar in the sidebar and on a phone.

## Why

From TON-166's mock (7 November 2026), the creator picked 11A, guide lines in the tree, and 12B, a round account avatar. Three levels deep, the tree showed its structure only by indentation, and the account was a bare name.

## What Changes

- **Guide lines (11A).** Under every level above a row's own, a faint `border.subtle` line where that level's chevron sits, covering the 1px gap between rows, so an open folder's branch reads as one down to its last child. The rename and new-name editors draw them too. Desktop only: phones have no tree.
- **Round avatar (12B).** The account menu shows a round avatar before the name: the name's first letter, white, on a color whose hue comes from the name's hash, as a cover's letter tile does. On a phone, the top bar's Account button shows it in place of the person icon. Its lightness keeps the white letter at 4.5:1 at every hue.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the tree draws guide lines; the account menu shows an avatar.

## Impact

- **`apps/web`:** a new `features/collection/tree-guides.tsx`, used by `collection-tree.tsx` and `name-editor.tsx`; a new `features/account/avatar.tsx`, used by `account-menu.tsx`; `artwork-tile.ts` exports its hash and first-letter rule. Tests: `avatar.test.ts`, `collection-navigation.e2e.ts`, `mobile.e2e.ts`.
- **Docs:** DS-27 and DS-31 as built.
- No API, data or sync change.
