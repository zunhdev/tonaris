## ADDED Requirements

### Requirement: Moves that change who sees what are confirmed
A move by Move to… or by dragging onto the tree SHALL apply at once when it changes no one's access, and otherwise SHALL wait for a confirmation that lists the change, with Cancel focused (FR-07.14, DS-49). When the change can't be read, the confirmation SHALL say so.

#### Scenario: Into a shared folder
- **WHEN** the owner moves "Doom" into "Metal", which Anna sees
- **THEN** "Move 'Doom' to 'Metal'?" lists "Newly visible to Anna", and Cancel leaves it where it was

#### Scenario: Nothing changes
- **WHEN** the owner moves an unshared list into an unshared folder
- **THEN** it moves at once

### Requirement: Deleting a shared folder says its sharing pauses
When a folder, anything inside it, or a folder above it is shared, its deletion's confirmation SHALL say that the people and links it reaches can't open it while it's in Trash, and that recovering it gives them access again (DS-28, DS-50, FR-07.16).

#### Scenario: A folder with a link
- **WHEN** the owner deletes "Metal", whose link is on
- **THEN** the confirmation says anyone with a link to it can't open it while it's in Trash
