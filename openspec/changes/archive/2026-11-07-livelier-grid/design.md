# Design

## Context

- **Tokens:** `tokens.css` holds the primitives (OKLCH ramps named by lightness ×1000), the dark theme's semantic tokens, and the Tailwind theme. `tokens.test.ts` checks DS-14's contrast pairs, the DS-12 values, and that nothing outside `tokens.css` names a primitive. Tailwind's own colors and shadows are removed, so every color and shadow a class can name is declared there.
- **Covers:** `Artwork` is a square `span` with `overflow-hidden`, the letter tile, and an `img` over it. Rows, cards, the album panel, the search palette, Find artwork and guest pages use it.
- **Cards:** `AlbumCard` is a grid cell whose accessible name is its text: title, artist, year, services. Its service links take no focus, keep the grid's focus on mouse down, and stop the click from reaching the cell, so the album panel doesn't open (TON-105). `useAlbumGrid` already reads the open album (`?album=`) through `useAlbumOpening`, so `AlbumCards` re-renders when it changes.
- **Hover:** Tailwind v4's `hover:` applies only under `@media (hover: hover)`, so touch screens never match it.
- **Guest grid:** `AlbumItem` in `share-content.tsx` is a list item, not interactive; its links take focus.

## Goals / Non-Goals

**Goals:** the five variants as on the mock; card links unaffected; phones correct; the contrast guarantees kept by the test.

**Non-Goals:** a light theme, labels in rows, a hover on guest cards (they open nothing), the other ideas (TON-166).

## Decisions

### 1. New primitives for the tinted ramp

The old gray primitives are replaced, not tuned in place: their names give their lightness, which moves (0.155 → 0.16 and so on). The ramp sits at hue 274 with chroma 0.008 for the lightest text up to 0.03 for `border.strong`; `bg.selected` uses a new `violet-280` (0.28 0.05 276). Each semantic token keeps its name, so no component changes. `fg.on-accent`, the accent and the status colors stay.

### 2. The cover's edge is a layer above the image

An inset shadow on the `Artwork` box would paint under the image, so the edge is an empty, `aria-hidden` span after the image, with an inset 1 px ring in a new `border.artwork` (white at 10%). It shows on every cover, rows included, and costs nothing to lay out. The shadow is a new `shadow-artwork` (two soft layers at 35% black), put on the box by an opt-in `raised` prop: cards, guest grids and the album panel. `overflow-hidden` clips the box's content, not its own shadow.

### 3. The open card is decided by the grid

`AlbumCards` passes `open` to each card from the inspector's album. The card's cover gets a 2 px `accent.solid` outline 3 px off it (outlines follow the corner radius), and its title the accent fill with `fg.on-accent`, padded and pulled back by the same 6 px so its text stays aligned with the other cards'. The card carries `data-open` for tests.

- **Why not `aria-selected`?** The grid has no selection (DS-21); the inspector, a named landmark, already says which album is open.

### 4. The hover is a pseudo-element behind the card

The card becomes `relative isolate`, with a `::before` 8 px outside it, behind its content (`-z-10` inside the card's own stacking context), `pointer-events: none`, and `bg.hover` under `hover:`. Being behind the content and taking no pointer events, it can't come between a click and a link; being outside the card's box, it changes no layout. 8 px is half the 16 px gap, so two neighbours' surfaces never overlap.

### 5. One label rule for cards and guest grids

`releaseLabel(album)` returns the type's name for EP, Single and Compilation (DS's group names), adds "Live" for a live album, joined by " · ", or nothing. The label sits on the cover's top-left corner (the save state has the top-right): `text.micro`, semibold, upper-cased with a little tracking, white (`fg.on-artwork`) on a 75% dark ground (`bg.on-artwork`) with a small background blur. It is `aria-hidden`, and the same words follow the year for assistive technology, so the cell's name still starts with the title.

- **Why its own rule rather than FR-05.9's group?** The group puts a live compilation in Live only, because an album sits in one group. A label can say both.
- **Contrast:** the worst cover under the label is white. The token test blends the ground over white and checks the label at 4.5:1.

## Risks / Trade-offs

- [The tint changes every surface at once] → the semantic names stay, the contrast test guards the pairs, and the mock showed the values on a real list first.
- [Backdrop blur on many labels] → the grid is virtualized and only non-album releases get a label; without blur support the 75% ground still holds the contrast.
- [Shadows outside DS-16's floating layers] → limited to covers in cards and the album panel, recorded in DS-16 as the one exception.
