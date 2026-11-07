# Design

## Context

- The floating layers each name `bg-raised` in their own class string: `dropdown-menu.tsx`, `popover.tsx`, `command.tsx`, `tooltip.tsx`, `toast.tsx`. Dialogs share `dialogSurfaceClass` in `lib/floating.ts`.
- Text fields, text areas and selects share `controlClass` in `input.tsx`. Select is the browser's own `<select>`, so its list is the system's, not a floating layer of ours.
- Fields sit on `bg.panel` (the album panel, Settings), on `bg.raised` (dialogs) and on `bg.app` (sign-in).
- `contrastOnGround` (TON-167) computes text on a translucent ground over a backdrop.

## Decisions

### 1. One frosted ground, 94%

`bg.frosted` is `bg.raised` at 94%, with Tailwind's `backdrop-blur-xl` (24px) and `backdrop-saturate-150`. 94% is the most see-through value at which `fg.tertiary` still reaches 4.5:1 over a white cover; the token test checks all three text colors there. Where blur isn't supported, 94% is nearly solid and the contrast holds anyway, so no fallback is needed.

- **Dialogs stay solid:** they already sit over a scrim, and their forms read better on a calm ground.

### 2. A field's fill is a veil, not a surface

`bg.field` is white at 5% rather than `bg.raised`: on a dialog, which is `bg.raised`, a `bg.raised` field would vanish. The veil lightens whatever is behind it, so a field shows on every surface. Its edge is `border.subtle`, turning `border.strong` on hover (100 ms, DS-17); `aria-invalid`'s danger edge still wins.

### 3. DS-14's input borders, as decided

DS-14's 3:1 for input borders now applies under the pointer. The token test keeps checking `border.strong` at 3:1, and adds the field's text on its veil over each surface.

## Risks / Trade-offs

- [A field's edge is about 1.2:1 at rest, below WCAG 1.4.11's 3:1 if the edge were the only cue] → fields are also identified by their fill, label and place; the creator chose this knowingly.
- [Backdrop blur costs paint time] → only one floating layer is open at a time.
