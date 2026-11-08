# Spec Delta

## ADDED Requirements

### Requirement: A destination folder is found by typing
"Move to…" and the restore prompt's destination SHALL find the owner's folders that can take the item by the words of their path, as "Add to a list" finds lists (FR-01.4, FR-01.15, FR-12.5, DS-49, DS-56, TON-183). Before typing, Collection SHALL come first, then the folders this device last moved things into, then others by path, 8 folders in all, with how many more there are.

#### Scenario: A folder found by a word of its path
- **WHEN** an owner opens "Move to…" for the list "Перемотка", types "metal black" and presses Enter
- **THEN** "Перемотка" moves into "Metal › Black"

#### Scenario: Recent first
- **WHEN** an owner has just moved a list into "Metal › Doom" and opens "Move to…" for another list
- **THEN** Collection comes first, then "Metal › Doom" under "Recent"
