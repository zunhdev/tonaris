# Design

## Context

- A container record is `{ id, kind, parentId, name, description, color }`. `container.setColor` (TON-175) added `color` as a field of the record with its own mutation, so it travels in the bootstrap, the stream and shared snapshots, and the client's container collection turns a changed field into its mutation (`containerUpdates`).
- `ContainerIcon` draws Lucide's Folder or ListMusic, in the container's effective color and filled with it at 25%.
- Lucide 1.70 has no saxophone, trumpet, violin, banjo or clef.

## Decisions

### 1. A field of the record, set by its own mutation

`icon` joins the record, as `color` did. `container.setIcon` follows `container.setColor`: compare-and-set on the prior icon (TS-21), refused in Trash, appended to the mutations' union (additive for oasdiff). `container.create` is untouched: a new folder or list has no icon.

### 2. Stored as the picture, not a genre

The values name what is drawn (`guitar`, `horns`, `saxophone`), not a genre, so one icon serves Rock and Русский рок alike and the set can grow without renaming. The order of `containerIcons` is the picker's.

### 3. Not inherited

Colors inherit because the glyph's shape still says folder or list. An inherited icon would draw every list under Metal as horns and lose that. Only the container's own icon replaces its glyph; the tree's chevron and the count still tell a folder from a list.

### 4. A curated set that holds at 14 px

From a to-scale mock of the creator's tree: the box-shaped icons (turntable, cassette, radio), the two guitars, and piano with keyboard blur together at 14 px, so the set keeps one of each shape. The saxophone and violin are drawn on Lucide's 24 grid with its round caps and joins, through `createLucideIcon`, so they take the same stroke, size and fill as the rest.

### 5. One picker for the menu and the palette

A grid of 24 is too tall for a submenu, so the ⋯ menu's Icon… and ⌘K's Icon… open the same dialog: None and the icons as a radio group, in the container's color, moved through with the arrow keys. Choosing one sets it and closes, as Color… does.

## Risks / Trade-offs

- [A genre icon is lighter than the solid folder glyph, so a color reads less strongly] → the 25% fill stays; the creator saw both in the mock.
- [Hand-drawn glyphs can drift from Lucide's style] → only two, on its grid and stroke, checked at 14, 16 and 20 px beside Lucide's.
