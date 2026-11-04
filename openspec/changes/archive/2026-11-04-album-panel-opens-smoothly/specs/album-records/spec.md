# Spec Delta

## ADDED Requirements

### Requirement: A card opens the inspector at once
A click on an album's card SHALL open the inspector at once, in Viewing and Editing mode alike (FR-03.1, DS-46, TON-159). In Rows, in Editing mode, with the inspector closed, a click SHALL wait 300 ms for a double-click, which edits the cell instead (DS-45).

#### Scenario: A double-click on a card in Editing mode
- **WHEN** an owner in Editing mode, with Grid as the layout, double-clicks an album's card
- **THEN** the inspector shows the album

#### Scenario: A double-click on a row's title in Editing mode
- **WHEN** an owner in Editing mode, with Rows as the layout, double-clicks an album's title
- **THEN** the title's editor opens in its row, and the inspector stays closed
