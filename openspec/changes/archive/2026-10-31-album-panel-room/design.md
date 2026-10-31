# Design

## Context

- **The sidebar's right edge** is a window splitter (TON-33): a focusable `separator` whose value is the sidebar's width, moved 16 px a step with ← and →, Home and End, or dragged with pointer capture. The width is kept in localStorage.
- **The inspector** is a third grid column, 380 px wide, from 1100 px up, or a fixed panel over the view's right edge below that. The cards' grid works out card sizes as if the inspector took no room (TON-106), reading its width from the shell.

## Decisions

### 1. One splitter for both panes

The sidebar's handle moves into `resize-handle.tsx` and takes the pane's limits and its edge. On the inspector's left edge, ← and a drag to the left widen the pane, so the value stays the pane's width and Home and End still mean narrowest and widest.

### 2. The width lives in the shell

The shell keeps the inspector's width, as it keeps the sidebar's. It writes the width to `tonaris:inspector`, sizes the grid column with it, and passes it to the overlay panel. `ShellControl.inspectorWidth` replaces the old constant for the cards' grid.

### 3. 320 to 560 px

320 px keeps the Links rows and the chronology's segmented control on one line. 560 px leaves the artwork its full 500 px plus padding. The main view keeps the rest of the width. At the narrowest wide window (1100 px), with a 360 px sidebar, the view still gets 180 px, and the overlay below 1100 px never exceeds the window.

### 4. Artwork up to its source size

Covers from Find are 500 px wide, so the artwork is `w-full` up to 500 px and doesn't upscale them past that. It stays the fixed square over its letter tile (DS-23), so its size depends only on the panel, never on the image.

### 5. Find beside its field

Find is a ghost button, as the panel's other buttons are, 32 px tall to match the field it sits beside. Its visible label shortens to "Find". Its accessible name stays "Find artwork": WCAG's label-in-name holds, since it starts with the visible text. The manual entry form's `TextField` takes an `action` for the same layout.
