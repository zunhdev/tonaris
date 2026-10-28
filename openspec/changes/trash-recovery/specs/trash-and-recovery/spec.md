## ADDED Requirements

### Requirement: Recovery reports what it skipped
Recovering a folder or list SHALL restore entries only for albums that are active, keeping their current data (FR-01.14). Each entry it skips SHALL be reported with its reason: the album is in Trash, or it was deleted permanently. Everything else SHALL be recovered.

#### Scenario: An album in Trash
- **WHEN** the owner recovers "Doom", one of whose albums is in Trash
- **THEN** "Doom" is back with its other albums, and the notice says one membership was skipped, its Details naming the album and that it is in Trash

### Requirement: Recovery prompts change nothing until answered
When recovery needs a destination or a name, the owner SHALL be asked (DS-56): for a destination, among the collection and the active folders; for a name, with the current one selected for editing and a way to choose another place instead. Cancelling SHALL leave the unit in Trash with its expiry running. A name still taken SHALL be refused with its reason, and nothing SHALL be renamed automatically.

#### Scenario: Cancelled
- **WHEN** recovery asks where to restore "Doom", and the owner cancels
- **THEN** "Doom" stays in Trash, its expiry unchanged

#### Scenario: A destination chosen
- **WHEN** recovery asks where to restore "Sludge", whose folder is in Trash, and the owner chooses the collection
- **THEN** "Sludge" is restored at the top level

#### Scenario: Another name
- **WHEN** recovery asks for another name for "Doom", and the owner enters "Doom (old)"
- **THEN** the list is restored as "Doom (old)", next to the other "Doom"
