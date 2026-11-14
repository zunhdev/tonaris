## ADDED Requirements

### Requirement: Move to position… rearranges by number
In a view in manual order, the palette's "Move to position…" SHALL move the focused album, folder or list to the whole number typed, among the items it moves among (its group's, when grouped), SHALL announce the move as other moves are, and SHALL keep the focus on the item. A number outside 1 to their count SHALL be refused in place, and under another sort the command SHALL be unavailable (DS-49).

#### Scenario: Moving to the top
- **WHEN** a person focuses the third of three albums in a list in manual order and chooses "Move to position…" with 1
- **THEN** it is first, and "Moved {title} to position 1 of 3" is announced

#### Scenario: Out of range
- **WHEN** they enter 4 for a list of three
- **THEN** "Enter a whole number from 1 to 3." shows under the field and nothing moves
