## ADDED Requirements

### Requirement: Trash expires after 30 days
Units SHALL be removed for good once 30 days have passed since their deletion, with their recovery information (FR-01.17). A container's removal SHALL remove only its organization: its albums stay in their other lists or Unsorted. Albums SHALL expire individually (FR-14.5).

#### Scenario: Expired
- **WHEN** a list's unit is 30 days old at the hourly check
- **THEN** the list and its entries are gone, its albums stay in their other lists or Unsorted, and the owner's sessions see the unit leave Trash

### Requirement: Early permanent removal is confirmed and app-only
The owner SHALL be able to remove units for good before they expire, or empty Trash, only in the app and after confirming (FR-01.18, X-03). Units already gone SHALL be reported, and the rest still removed. A purged album SHALL free its slot.

#### Scenario: Through MCP
- **WHEN** an MCP connection in Manage mode asks to purge a unit
- **THEN** it is refused as app-only, and the unit stays

### Requirement: Purged content is reported by later recoveries
Purging an album SHALL leave a tombstone in every unit still referring to it, and purging a list SHALL leave one in the unit of any album in Trash that was in it. A later recovery SHALL report those entries as skipped, never recreating them (TS-13).

#### Scenario: A list purged while its album is in Trash
- **WHEN** "Dopesmoker" is in Trash, its list "Doom" is purged, and the owner restores "Dopesmoker"
- **THEN** the restore reports that "Doom" was deleted permanently
