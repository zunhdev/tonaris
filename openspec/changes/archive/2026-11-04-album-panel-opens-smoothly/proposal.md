# Proposal

Linear: TON-159 (Design). Implements FR-03.1's inspector (DS-46), FR-03.4's artwork (DS-23) and DS-17's inspector slide. Done when a card opens the album panel at once in either mode, artwork the browser already has shows at once, and the panel slides in and out.

## Why

In the creator's manual testing (4 November 2026), opening an album, which happens all the time, felt slow and abrupt: about half a second before the panel showed, and no motion when it opened or closed. A probe of the production build (200 albums, one run each) found three causes:

- **Editing mode:** a click waited 300 ms for a double-click in rows and cards alike (about 330 ms in all). Only a row's title, artist and year edit on a double-click (DS-45); cards have nothing to double-click, so there the wait was for nothing.
- **View mode:** the panel showed in about 33 ms, but its artwork started as the letter tile and faded in, fully shown only at about 200 ms, although the card had already loaded the same image.
- **No motion:** DS-17 lists a 200 ms inspector slide, which was never built.

## What Changes

- **Cards open the panel at once,** in either mode. **Rows in Editing mode keep the wait** (the creator decided this on 4 November 2026), so a double-click on a title, artist or year still edits the cell without opening the panel.
- **Artwork the browser already has shows at once,** without the 150 ms fade, wherever it shows. Artwork still loading fades in as before.
- **The panel slides in from the right over 200 ms** with DS-17's enter easing, and slides out with its exit easing. The view narrows at once when the panel opens, and widens at once when it closes, while the panel slides out over it. On a phone, the album sheet slides up and back down.
- **With reduced motion,** the panel fades instead. **Back and Forward,** and a panel already open when the page loads, show it at once, as page switches do (TON-140).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: a card opens the inspector at once; rows in Editing mode wait for a double-click.
- `design-system`: the album panel slides in and out; loaded artwork shows at once.

## Impact

- **`apps/web`:** `inspector-state.ts` (the wait only where a double-click edits), `album-grid.ts`, `inspector.tsx` (the panel while it slides out), a new `features/shell/inspector-slide.ts`, `shell.tsx`, `artwork.tsx`; browser tests in `album-inspector.e2e.ts`, `artwork.e2e.ts`.
- **Docs:** DS-17, DS-23 and DS-46 as built.
