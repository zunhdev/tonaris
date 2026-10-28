# Design

## Context

- **Shortcuts:** the matcher (`shortcuts.ts`) maps keys to `ShortcutAction`s. `use-shortcuts.ts` runs them against the live focus:
  - the tree's focused item (`ui.focused()`), a view's focused row (`ui.focusedRow()`), the focused album (`ui.focusedAlbum()`);
  - the inspector's album;
  - the view's container.
- **Other keys live where they act:** F2 in the tree and album rows, R in Trash's table, ⌘Enter in forms.
- **The reference** (`shortcutReference`) is a hand-written list.
- **Focus leaves those places when the palette opens,** and some of them clear their focus record on blur.
- **The device already remembers views and layout** in `device.ts`.

## Goals / Non-Goals

**Goals:**
- one command list behind the palette and the reference;
- commands that act as their keys do;
- recent items and frequent commands.

**Non-Goals:**
- synced recents;
- commands for navigation keys (decided with the creator);
- editing an album's title from the palette: F2's command renames folders and lists, and album rows keep F2 for their title.

## Decisions

### 1. One command list

- **`commands` in `shortcuts.ts`:** each has an `id`, a `title`, its `keys` and a reference `section`. Ids are the matcher's actions (less `search`), plus `rename` (F2) and `restore` (R).
- **Labels:** a few have a palette label that follows state: "Switch to editing" or "Switch to viewing", "Hide sidebar" or "Show sidebar". They match by both label and title.
- **The reference** is built from `commands` plus a list of navigation keys, in the same sections. A unit test checks each command appears in it once, with its keys. ⌘K is in the reference: it is the palette itself, so it's not a command.

### 2. One runner

- **`useCommandRunner()`** in `use-shortcuts.ts` turns an id and a **target** into the action, with the checks keys already make (offline, an editor open, Editing first).
  - The target is `{container, album, unit}`: the focused folder or list, the album (inspector first), and the Trash unit.
- **`blocked(id, target)`** gives the reason a command can't run, or nothing:
  - "You're offline" for edits;
  - "Open or focus an album first";
  - "Focus a folder or list first" (Move and Rename also take the view's own folder or list);
  - "Focus an item in Trash first".
- **The key listener** builds the target from the live focus.
- **The shell** builds it when the palette opens, before focus moves: from the same getters, the inspector, and the focused element's Trash row (`tr[data-unit]`).
- **New in the runner:**
  - `rename` starts the tree's name editor;
  - `restore` runs recovery on the unit, as R does.

### 3. Running from the palette

- **Choosing a command** records the use, closes the palette, and runs the command once the dialog has closed (`onOpenChangeComplete`). Otherwise the dialog returning focus would steal it from a name editor or a dialog the command opened.
- **A blocked command** is `aria-disabled`, shows its reason, and does nothing when chosen.

### 4. Recent and frequent

- **`recentItems` in `device.ts`,** per account: `{kind, id}` newest first, deduplicated, keeping 20.
  - The workspace route records `/f/:id`, `/l/:id` and `/a/:id`, then `?album=`, as they change.
  - The palette shows the first 8 still in the collection, located like results.
- **`commandUses` in `device.ts`,** per account: counts of palette runs. `frequentCommands(uses)` takes up to 5 by count (ties in list order), then fills from the starter set.

### 5. Groups

- **Empty query:** Recent, Frequent commands.
- **`>…`:** Commands only, all that match, in list order within their tier.
- **Otherwise:** Folders, Lists, Albums, then Commands, each with up to 8 and "Show all". Commands rank with `rankNames` over their label and title.

## Risks / Trade-offs

- **[A target captured at opening goes stale while the palette is open]** → It is used at once on close. A target deleted meanwhile makes the action a no-op, as a key on a vanished row would be.
- **[Sidebar-click opening loses the focus target]** → Clicking moves focus to the button first. Commands then fall back to the inspector's album and the view's container, or say what to focus.

## Migration Plan

None: client-only.
