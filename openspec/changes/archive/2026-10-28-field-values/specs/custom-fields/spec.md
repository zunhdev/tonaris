## ADDED Requirements

### Requirement: Albums apply fields, and applied-empty stays apart from unused
An owner SHALL apply any of their fields to an album, and SHALL remove it (FR-03.7, FR-03.8). Values SHALL be per album, shared by every list it is in. An applied field MAY be empty, and an empty value SHALL stay apart from an unused field, from zero and from No: it SHALL never be replaced with a default. Removing a field from an album SHALL clear its value, and applying it again SHALL start empty. Other albums and the definition SHALL be unaffected.

#### Scenario: Applied but empty
- **WHEN** an owner applies the number field "Rating" to an album and enters nothing
- **THEN** the album shows "Rating" as applied and empty, not 0 and not absent

#### Scenario: Removed and applied again
- **WHEN** an album's "Rating" is 4, and the owner removes the field and applies it again
- **THEN** "Rating" is applied and empty

#### Scenario: Yes, No and empty
- **WHEN** an owner applies the yes/no field "Owned" and leaves it empty
- **THEN** it is neither Yes nor No

### Requirement: Values are validated by their field's type
A value SHALL be accepted only as its field's type allows (FR-03.10): text, of at most 2,000 characters; a valid number; a valid calendar date; Yes or No; at most one existing option; or a set of existing options without repeats. An invalid value SHALL be refused with its reason, nothing SHALL change, and the input SHALL stay for correcting (X-05).

#### Scenario: Not a number
- **WHEN** an owner enters "four" in a number field
- **THEN** it is refused with the reason, and the field keeps its value

#### Scenario: Not a calendar date
- **WHEN** an owner enters "2026-02-30" in a date field
- **THEN** it is refused, and nothing changes

#### Scenario: Another field's option
- **WHEN** a single-choice value names an option that isn't the field's
- **THEN** it is refused, and nothing changes

#### Scenario: A repeated option
- **WHEN** a multiple-choice value names the same option twice
- **THEN** it is refused, and nothing changes

### Requirement: Values reach every session and change by compare-and-set
Field values SHALL reach every session of the owner, in the data a session loads and as they change (FR-09.1). A value set over one changed elsewhere since the person saw it SHALL be a conflict, and nothing SHALL change (TS-21).

#### Scenario: Changed elsewhere
- **WHEN** a session sets "Rating" to 5 while another, still showing 4, sets it to 3
- **THEN** the second is a conflict, and "Rating" stays 5
