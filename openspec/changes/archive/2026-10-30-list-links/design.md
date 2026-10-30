# Design

## Context

- **`ServiceAnchor`** (TON-104) renders a link that opens where the account's link setting says.
- **The rows** already have a services column, as plain text, from 760 px of view width (DS-21).
- **A card** is a grid cell. A click anywhere in the grid opens the inspector (`useAlbumOpening`), and focus inside a cell moves the grid's roving focus. With the inspector open, it also shows the focused album.

## Goals / Non-Goals

**Goals:** links on cards and rows that open a service and do nothing else.

**Non-Goals:**
- keyboard focus for each link, since the grid keeps one tab stop and `O` is the keyboard's path;
- the shared pages' grid, which already has an Open popover on each card.

## Decisions

### 1. One `ServiceNames` for cards and rows

It renders the album's links in the services' order, each a `ServiceAnchor` named by its service, joined by a separator: " · " on cards, ", " in rows, as the column read before.
- **Accessible name:** "Open '{title}' in Spotify". It contains the visible name (WCAG 2.5.3) and says which album, since a row reads cell by cell.
- **Pointer-only, like the Open button:** `tabIndex={-1}`.
- **No side effects:** `mousedown` is prevented, so the link takes no focus and the inspector doesn't follow it, and the click's propagation stops, so the grid doesn't open the inspector.
- **Alternative:** links in the tab order. Rejected: each card would add up to four tab stops inside a grid that has one.

### 2. The card's text grows by a line

`textHeight` goes from 68 to 88 px, which is one 16 px `text-small` line and its 4 px gap. Every card keeps the line, empty without links, so the virtualizer's rows stay one height.

## Risks / Trade-offs

- **[Trade-off] Taller cards** show fewer rows per screen. → 20 px against a 160–200 px tile.
