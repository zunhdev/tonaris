# Design

## Context

- "Add to a list" (TON-177) is a "Find a list" combobox over a listbox, as the palette is (DS-115), with its rules in `list-picker.ts`: `listChoices`, `suggestions`, `findLists`, `matchedParts`.
- "Add albums" and "New album" had a native `<select>` of every list's path, with "No list (goes to Unsorted)" first. Its value is the destination, chosen before saving, not an action.
- `Popover` (Base UI) can sit on the dialog's layer (`inDialog`, DS-18), as Find artwork's does.

## Decisions

### 1. One finder, two hosts

The field, the listbox, the groups, the marked matches and the notes move out of `add-to-list.tsx` into `ListFinder`. It takes the choices and an `onChoose`, plus, for the List field, an option standing for no list, shown first before typing, and the chosen list, marked with a check. "Add to a list" keeps its behaviour.

### 2. A button with a popover

The creator chose a button opening a popover over a text field: the dialog keeps its size, and the chosen path stays readable while finding another. The button has `role="combobox"`, Input's look and a chevron, and the field's label names it; the popover opens at its width, on the dialog's layer, with the focus in "Find a list", and gives the focus back when it closes. ↓, Enter and Space open it, as a select's keys do.

### 3. Esc closes the popover only

Base UI's popover inside its dialog keeps Esc to the innermost layer, so the capture dialog stays open and the manual entry form doesn't ask about discarding.

### 4. "No list" only before typing

Typing finds lists, and "No list" isn't one. Before typing it comes first, so it is one ↑ away from the field's start.

## Risks / Trade-offs

- [The popover is inside a form, but portalled out of it in the DOM] → Enter in "Find a list" doesn't submit the form; ⌘Enter still bubbles through React and adds, as from any field (DS-47).
- [The choices are rebuilt on each opening] → as in TON-177, a few milliseconds for thousands of lists.
