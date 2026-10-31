# Design

## Context

`ServiceNames` renders an album's services as links (TON-105), in the rows' Services column and on a line under each card's year. Both truncate. The links take no focus: `O` and the Open button are the keyboard's and the chooser's way.

## Decisions

### 1. Link cues without link colour at rest

A list shows dozens of rows, so violet names in every row would outshout the titles. The names read as links by their shape instead: an underline at rest (`fg.tertiary` at 50%) and a ↗. They're brighter than before, `fg.secondary`, so they read before the pointer reaches them. On hover they take the app's link colour, as every other link does.

### 2. The same ↗ as the panel

The panel's links (TON-123) end in ↗ (`ArrowUpRight`). The list's do too, at 12 px for `text.small`. It sits inside the link, outside the underlined name, so only the name is underlined.

### 3. Spacing, not separators

With a ↗ after each name, "Spotify ↗, Tidal ↗" stutters. Names are spaced 10 px apart instead, and the `separator` prop goes. The links stay inline content, so the cell still truncates with an ellipsis.
