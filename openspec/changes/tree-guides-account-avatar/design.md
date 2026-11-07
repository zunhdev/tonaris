# Design

## Context

- The tree is one flat ARIA tree; each row carries its level and is padded `4 + (level − 1) × 12` px, with a 14 px chevron (or spacer) first. Rows are 1px apart (`gap-px`). The rename and new-name editors are rows of their own (`name-editor.tsx`).
- The account menu's trigger is a full-width ghost button in the sidebar and a 44 px icon button on a phone.
- A cover's letter tile hashes the title with FNV-1a for its hue (`artwork-tile.ts`), and paints its colors through the DOM because the CSP refuses style attributes in server-rendered HTML.

## Decisions

### 1. Guide lines as spans in each row

`TreeGuides` renders, for each level above the row's, an absolutely positioned 1px span at 11 + depth × 12 px (the centre of that level's chevron), from 1px above the row to its bottom, so the 1px gap between rows is covered and a column draws an unbroken line. Rows become `relative`. Spans rather than a background gradient keep the positions in one obvious place, and `pointer-events: none` keeps drag, drop and clicks as they were.

### 2. The avatar's color

`oklch(0.52 0.12 h)`: the hue from the same FNV-1a hash as the covers' tiles, of the trimmed name. 0.52 is the lightest lightness at which `fg.on-accent`'s white keeps 4.5:1 for every hue (4.68:1 at teal); the mock's 0.58 fell to 3.7:1. Painted through a ref, as the tiles are. The letter is generated content from a `data-letter` attribute: as text, it joined the button's visible label, which then didn't match its name, "Account: …" (axe's label-content-name-mismatch).

## Risks / Trade-offs

- [More elements per tree row] → at most the row's depth, a handful; the tree isn't virtualized and stays small.
