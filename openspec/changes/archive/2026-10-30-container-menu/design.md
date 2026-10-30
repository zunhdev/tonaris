# Design

## Context

- **The sidebar tree** (DS-27) is an ARIA tree: each folder or list is one link with `role="treeitem"`, moved through with the arrows. A folder's chevron is a pointer-only element inside that link.
- **Commands:** `useCommandRunner` runs Rename, Move to…, Share… and Delete… for the shortcuts (F2, M, ⇧S, ⌫) and the palette, switching to Editing mode for edits and waiting while offline.

## Goals / Non-Goals

**Goals:** every container action reachable with the mouse from the sidebar, and Rename from the header, without new behavior behind them.

**Non-Goals:** a right-click menu, menus on the views' folder and list rows, new actions such as Duplicate.

## Decisions

### 1. The ⋯ is pointer-only, like the chevron

A button inside the row's link would nest interactive content, and one beside it would break the tree's structure. So the ⋯ is an `aria-hidden` element inside the link that opens the menu on click, as the chevron expands a folder. Keyboard users have the same menu from Shift+F10 or the Menu key, and every item's own key.

### 2. One menu for the tree

The tree holds which row's menu is open and renders one `ContainerMenu`, placed by that row through the menu's new `anchor`. The ⋯ stays shown while its menu is open.

### 3. The same commands

`ShellControl` now carries the runner's `run` and `blocked`. The menu's items and the header's Rename call them, so they switch modes, wait offline and act exactly as their keys do. After a chosen command, focus goes where that command puts it, such as the name's editor. After Escape, it goes back to the row.

### 4. The count gives way

On hover, a list's count hides and the ⋯ takes its place, so the row's width doesn't change.

## Risks / Trade-offs

- **The header grows by one button** in Editing mode. It fits beside Share and Delete at common widths. The breadcrumbs already truncate first.
