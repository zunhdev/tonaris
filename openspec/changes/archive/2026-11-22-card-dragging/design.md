# Design

## Context

- One dnd-kit context covers the workspace (`DragProvider`). A row is a draggable and a droppable (`useRowDrag`); its handle is the activator. Targets are found with `document.elementsFromPoint` (TON-302), and the side of a row is the half of it the pointer is in, by height.
- The overlay is a name chip placed at the pointer less its grip, the press's offset within the item (TON-302). For a row, held by its handle at the row's left, the chip sits just right of the pointer.
- dnd-kit's pointer sensor blocks the browser's own drag of links and images once pressed, and swallows the click that follows a drag.
- Cards are virtualized rows of cards 16 px apart; album cards' clicks open the inspector, folder cards are links.

## Decisions

### 1. The whole card is the handle

A card has no room for a handle that reads well over artwork, and grids elsewhere (Finder, Photos) drag the item itself. The card element takes dnd-kit's listeners. The 6 px activation keeps clicks, Enter and the service links working.

### 2. Sides by width

A drop target says which way it lies (`axis`): rows by height, cards by width. A card's side is the half of it, left or right, the pointer is in. "After the last card of a row" and "before the first of the next" are the same place, so no row-end target is needed.

### 3. A drop zone over the gap, only while dragging

A card's target is a span reaching half the gap (8 px) around it, as the hover surface does, and takes the pointer only while something is being dragged. Outside drags, clicks between cards still focus the grid as before.

### 4. The chip at the pointer

A card is held anywhere in it, often 100 px from its corner, so the press's offset would leave the chip far from the pointer. A dragged card's grip is fixed so the chip sits just right of the pointer and centred on it, where a row's ends up.

### 5. Cards follow their rows' rules

Album cards drag when their rows' handles show: under Manual in Editing mode to rearrange, and in the person's own lists and Unsorted in Editing mode to reach their lists in the sidebar. Folder and list cards drag under Manual in Editing mode, as their rows do. The rule for album rows moves into one hook both use.

## Risks / Trade-offs

- [A press on a card's service link that wanders 6 px starts a drag instead of opening the service] → the same threshold rows and the tree use; a click that stays put opens it.
- [Text on a card can't be selected by dragging in Editing mode under Manual] → its words show whole in a tooltip, and the inspector has them.
- [On a touch screen, a swipe on a card scrolls the grid, since cards keep the browser's touch scrolling] → rows' handles still drag by touch.
