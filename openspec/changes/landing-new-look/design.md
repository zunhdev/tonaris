# Design

## Context

- The pictures are static and server-rendered. The CSP refuses `style` attributes, so everything is drawn with classes.
- The app paints some of the new parts through the DOM (the avatar's hue, the wash, the tree's guide offsets), which the landing page can't do.

## Decisions

### 1. Copy the app's values into classes

The avatar's hue (285 for "Alex"), Blue Hour Sessions' wash (`oklch(0.21 0.08 263)`, computed with the app's `dominantColor` and `washColor`) and the guide offsets are written as arbitrary-value classes. Folder colors and chip tints reuse the app's `container-palette.tsx` maps, and labels reuse its `ReleaseLabel`.

### 2. A grid in the hero, with a colorful album open

A list opens in rows by default, but the new look is in the grid. The hero shows Late night's covers sorted by year, as a list is at first. Blue Hour Sessions is open instead of Field Notes, because Field Notes' cream cover would give an almost invisible wash. Blue Hour Sessions comes first in year order.

### 3. Room for Properties

The panel's cover stays smaller than the panel, and the picture is 680 px tall from 1024 px wide, so Properties' first rows show.

## Risks / Trade-offs

- [The hero no longer shows grouping by release type] → the release labels say the same on the covers.
