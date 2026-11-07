# Proposal

Linear: TON-168 (Design). Implements Q-10's experience direction for the floating layers (DS-16) and text fields (DS-20), and changes how Q-02's contrast targets (DS-14) apply to input borders, as the creator decided. Done when menus, popovers, the palette, tooltips and toasts are frosted, text fields are filled with a faint edge, and the contrast test covers both.

## Why

From TON-166's mock (7 November 2026), the creator picked 2A, frosted floating layers, and 4A, filled fields with a faint edge. Solid menus and bright-edged fields were two of the things that made the app read as dry and form-like next to Eagle.

## What Changes

- **Frosted floating layers (2A).** Menus, popovers, the ⌘K palette, tooltips and toasts become `bg.raised` at 94% under a strong background blur, so what's behind shows as a soft tint. At 94%, every text color keeps 4.5:1 even over a white cover. Dialogs and sheets stay solid over their scrim.
- **Filled fields (4A).** Text fields, text areas and selects get a light fill (`bg.field`, white at 5%, which shows on the panel and in a dialog alike) and a `border.subtle` edge, which turns `border.strong` under the pointer. Focus keeps the accent ring; a problem keeps the danger edge.
- **DS-14 for input borders** (decided by the creator, who chose 4A over a variant that kept 3:1): a field's edge reaches 3:1 under the pointer, not at rest. At rest, fields are told apart by their fill, their label and their place.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: input borders reach 3:1 under the pointer rather than at rest; floating layers are frosted; fields are filled.

## Impact

- **`packages/ui`:** `styles/tokens.css` (`bg.frosted`, `bg.field`), `styles/tokens.test.ts`, and the surfaces of `dropdown-menu.tsx`, `popover.tsx`, `command.tsx`, `tooltip.tsx`, `toast.tsx`; `input.tsx`'s shared control class, which Textarea and Select use.
- **`apps/web`:** browser tests in `design-system.e2e.ts`.
- **Docs:** DS-12, DS-14, DS-16 and DS-20 as built; the design decisions log.
- No API, data or sync change.
