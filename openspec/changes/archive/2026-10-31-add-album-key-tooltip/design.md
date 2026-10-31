# Design

## Context

Tooltips (DS-20) are Base UI's, opening on hover and keyboard focus. Two already named a key, as plain text: "Hide sidebar [" and "Show sidebar [". Menus show keys with `DropdownMenuShortcut`, smaller and in `fg.tertiary`.

## Decisions

### 1. A tooltip shortcut, like a menu's

`TooltipShortcut` is a `kbd` after the words, in `fg.tertiary` with a small gap, so "Add album  C" reads as a name and a key. The `[` tooltips use it too, so every tooltip shows keys the same way.

### 2. The key is also in the button

Tooltips only add clarity (DS-115). The button carries `aria-keyshortcuts="C"`, as the sidebar's already did, so assistive technology hears the key without the tooltip.

### 3. Only the buttons C stands for

C opens the capture dialog. The manual entry form's "Add album" submit is a different action (⌘Enter), so it gets no C.
