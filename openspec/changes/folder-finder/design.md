# Design

## Context

- "Find a list" (`list-finder.tsx`, TON-177 and TON-181) is a combobox over a listbox, as the palette is (DS-115), with its rules in the pure `list-picker.ts`.
- "Move to…" (`move.tsx`) and the restore prompt (`trash/recovery.tsx`) both use `PlaceList`: Collection and every folder that can take the item, from `destinations()`, as buttons or radios, indented by level.
- `SharingImpactPreview` reads DS-69's block for one destination; dialogs are centred (`dialogSurfaceClass`).

## Decisions

### 1. One finder for lists and folders

The field, listbox, groups, options, marked path and note move into a generic `Finder`. `ListFinder` and the new `FolderFinder` each give it their options, groups, icons and words. Enter never submits a form around the field, since the restore prompt is a form.

### 2. Folders as paths

A folder shows as its path, its parent folders dimmed ("Metal › Black"), as a list does in "Find a list", in place of the indented tree: found folders can come from anywhere, so the tree's levels don't hold. Collection is an option of its own, first before typing; typing "coll" finds it too.

### 3. Recent from this device

The creator chose the folders this device last moved things into. Nothing in the synced data says when something was moved, so they're kept per account on the device, as the palette's Recent is: a move from the dialog or by dragging records its folder, the latest 20 kept. A folder that can't take the item, or is gone, drops out.

### 4. The preview follows the active option

In "Move to…", the active option (↑ and ↓, or the pointer) is what the preview is for. There's always one, so the block is always there from opening. In the restore prompt, the preview is for the folder picked, Collection at first, as before.

### 5. Room kept, top pinned

The block keeps a minimum height of two lines (`2lh`, plus its padding and border). Both dialogs sit at 12% of the window's height, as the palette does, instead of centred, so a longer preview, a note or a shorter list moves only the bottom edge.

### 6. Kept answers forgotten after a move

Preview answers are kept for 30 seconds by item and destination. After a move, the same item and destination preview differently, since the item left its folder, so a move forgets them: reopening Move to… right away no longer shows the old answer.

## Risks / Trade-offs

- [Recent is per device] → a new device starts with folders by path, as a new account does.
- [A preview read per active option] → as before with focus and pointer; answers are kept for 30 seconds.
