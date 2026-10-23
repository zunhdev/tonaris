# Spec Delta

## ADDED Requirements

### Requirement: Owners edit an album's title, artist and year in its row
In Editing mode on desktop, an owner SHALL edit an album's title, artist and year inline in its row, starting with Enter or a double-click on the cell, or F2 for the title (FR-03.1, DS-45). The year SHALL be the one the cell shows: the original year, a live album's recording year or range, or the release year it falls back to. Offline, cells SHALL not open for editing (DS-81).

#### Scenario: Retitling an album
- **WHEN** an owner in Editing mode presses Enter on an album's title, types "Nightfall (Remastered)" and presses Enter
- **THEN** the row shows the new title, and it is saved

#### Scenario: A live album's recording range
- **WHEN** an owner edits the year of a live album recorded in 1978 and enters "1978–1982"
- **THEN** its year reads "rec. 1978–1982"

### Requirement: Inline album edits follow the album rules
An inline value FR-02.6 or the year's format refuses SHALL keep the editor open with the reason, and send nothing (X-05). Each saved edit SHALL be made from the value it replaces, so an edit of a value changed elsewhere is a conflict for review (FR-09.4).

#### Scenario: A refused year
- **WHEN** an owner enters "nineteen" as an album's year
- **THEN** the editor stays open with "Enter the year as four digits, such as 1986.", and nothing is sent
