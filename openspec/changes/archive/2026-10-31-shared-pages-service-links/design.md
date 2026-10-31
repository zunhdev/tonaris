# Design

## Context

Shared pages (`share-content.tsx`) draw a list's albums as rows or cards, for guests (DS-72) and signed-in viewers (DS-70). Each album had an Open button with a popover of `ServiceChoices`. The workspace's rows and cards show `ServiceNames` instead (TON-105, TON-125), which take no focus, because the grid keeps the focus and `O` opens the chooser.

## Decisions

### 1. The list's `ServiceNames`, focusable

Shared pages reuse `ServiceNames`, so the look stays one component. A `focusable` prop drops what keeps the workspace's grid in charge: `tabIndex={-1}`, the mouse-down that keeps focus where it was, and the click that stops at the link. Shared pages are plain lists with no `O`, so the links are the only keyboard path to a service. They take the base layer's focus ring.

### 2. Where the links sit

- **Desktop rows:** a Services column of 16 rem after the year, which fits three services and truncates like the workspace's. It's always there, empty without links, so the columns line up.
- **Phone rows:** the title and artist are stacked, and the links take a third line under them, wrapping if they must. A row with links grows to fit, while one without stays 56 px (DS-110). The links aren't truncated there, so every one stays reachable.
- **Cards:** a line under the artist and year, wrapping rather than truncating, since the cards aren't a fixed height.

Links are spaced by a margin on their right, so a wrapped line starts flush, and each stays whole with its ↗. A row renders `ServiceNames` twice, once per breakpoint. The hidden one is `display: none`, so it isn't in the accessibility tree or the tab order.

### 3. Destinations unchanged

Links go through `ServiceAnchor`, as the popover's did. A guest has no link setting, so their links open the canonical page in a new tab with `rel="noopener noreferrer"`. A signed-in viewer's follow their setting (TON-104).
