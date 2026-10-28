## ADDED Requirements

### Requirement: Folders and lists have optional descriptions
A folder or list SHALL have an optional plain-text description, which its owner SHALL set, change and clear as an ordinary change (FR-03.5). It SHALL be trimmed, empty text SHALL clear it, and it SHALL be at most 2,000 characters. A change SHALL apply only if the description is still the one the client saw (TS-21). It SHALL reach the owner's other sessions live, and SHALL show under the folder's or list's header and, as its first line, in its row (DS-41).

#### Scenario: Written and shown
- **WHEN** the owner describes the list "Grunge" as "Seattle, 1988 to 1994"
- **THEN** the list's page shows it under its name, and its folder's row shows it after the name

#### Scenario: Too long
- **WHEN** the owner enters 2,001 characters
- **THEN** the description is refused with "Descriptions can be at most 2,000 characters.", and the text stays for correcting

### Requirement: Descriptions survive moves and Trash, and are never searched
A description SHALL stay with its folder or list through moves, Trash and recovery (FR-03.5). Search SHALL NOT match descriptions (FR-12.4).

#### Scenario: Moved
- **WHEN** a described list moves to another folder
- **THEN** it keeps its description

#### Scenario: Recovered
- **WHEN** a described list goes to Trash and is recovered
- **THEN** it has its description

#### Scenario: Not searched
- **WHEN** only a description contains "Nirvana", and the owner searches for "Nirvana"
- **THEN** nothing matches
