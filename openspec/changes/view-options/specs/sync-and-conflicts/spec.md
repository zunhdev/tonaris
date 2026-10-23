# Spec Delta

## MODIFIED Requirements

### Requirement: A change made from a stale value is a conflict
A change SHALL name the values it was made from. If any of them no longer matches the saved value, the saved state SHALL be kept, nothing of that change SHALL be applied, and the outcome SHALL report each mismatched field's current, attempted and prior values (FR-09.4). Changes to different fields of one record SHALL both apply. This SHALL hold for personal preferences as for collection content.

#### Scenario: A stale edit
- **WHEN** another session saved a new title after this session read the album, and this session saves a title and a year made from the old values
- **THEN** the newer title stays, the year isn't applied either, and the outcome reports the title's current, attempted and prior values

#### Scenario: Edits to different fields
- **WHEN** one session edits an album's title and another edits its year, each from the values it read
- **THEN** both edits apply

#### Scenario: A stale view choice
- **WHEN** another session sorted a list by Name after this session read it, and this session sorts the list by Year made from the old choice
- **THEN** the list stays sorted by Name, and the outcome reports the sort's current, attempted and prior values
