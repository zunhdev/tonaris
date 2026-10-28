## ADDED Requirements

### Requirement: Trash shows units with their expiry and former place
Trash SHALL list the owner's units, each with its name, what it holds, when it was deleted, when it expires, and where it was (DS-55). The expiry SHALL read in words with the exact date on hover or focus, and warn under 3 days. A local filter SHALL narrow the units by name.

#### Scenario: A deleted folder
- **WHEN** the owner opens Trash after deleting the folder "Metal" with two lists
- **THEN** its row reads "Folder · 2 lists", "Expires in 30 days", and "Collection" as where it was

### Requirement: A folder's contents are read-only in Trash
A folder unit SHALL open to show its folders and lists, explaining that they are part of the folder and are acted on by restoring or deleting the folder (FR-01.13). They SHALL have no actions of their own.

#### Scenario: Opened
- **WHEN** the owner opens "Metal" in Trash
- **THEN** "Doom" and "Sludge" show under "Part of 'Metal' — restore or delete the folder to act on these.", with no buttons

### Requirement: Trash is operable by keyboard
Every action in Trash SHALL work by keyboard: opening a folder's contents, Restore, also as R on the focused row, Delete permanently…, Empty Trash…, and the filter. Deleting permanently and emptying Trash SHALL be confirmed, naming the count, and stating that they can't be undone (DS-57).

#### Scenario: R
- **WHEN** focus is on a unit's row and the owner presses R
- **THEN** the unit is restored, asking where or as what only when it must
