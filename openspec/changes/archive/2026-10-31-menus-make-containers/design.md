# Design

## Context

- `useStartEditor` takes either `{ mode: "new", kind }`, which places the new one with `placeFor(focused, view)` as N does, or a full editor, such as `{ mode: "create", kind, parentId, name: "" }`, which it opens where it says. Either way it expands the folders down to the editor and switches to Editing (DS-45).
- `placeFor(container)` names a folder's own ID and a list's folder: exactly "inside a folder, beside a list".

## Decisions

### 1. The menus name their place

The ⋯ menu's New list and New folder open the create editor with `parentId: placeFor(container)` for its row. The "+" opens it with `parentId: null`. Neither goes through the command runner, whose N reads the live focus, which is in the menu by then.

### 2. Keys only where they match

A row's menu opens on a focused row, or by its ⋯, which is on that row. N there makes the list exactly where the menu's New list does, so those items show N and ⇧N. The "+" makes them at the top level, while N follows the focus or the view, so its items show no key.

### 3. The new items come first

As in Finder's and VS Code's menus, New list and New folder open the row's menu, then a separator, then Rename, Move to… and Share…, then Delete…. They wait while offline, as the other edits do (DS-81).
