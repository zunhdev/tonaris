## ADDED Requirements

### Requirement: Albums dragged onto a list in the sidebar join it
In Editing mode on a computer, an album dragged by its handle from the person's own list or Unsorted onto another of their lists in the sidebar SHALL be added to that list and SHALL stay where it was. Holding ⌥ at the drop, from a list, SHALL move it instead, with Undo. A list the album is already in, a folder, and any list while offline SHALL take no drop, and albums in a share SHALL NOT be dropped on the person's own lists (DS-49).

#### Scenario: Adding by dragging
- **WHEN** the owner drags 'Dopesmoker' from the list "Doom" onto the list "Stoner" in the sidebar
- **THEN** it is in both lists, and "Added Dopesmoker to Stoner" is announced

#### Scenario: Moving with ⌥
- **WHEN** the owner holds ⌥ while dropping 'Dopesmoker' from "Doom" onto "Stoner"
- **THEN** it leaves "Doom" for "Stoner", and a toast "Moved to Stoner" offers Undo
