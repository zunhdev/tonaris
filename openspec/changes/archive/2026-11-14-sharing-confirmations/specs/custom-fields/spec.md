## ADDED Requirements

### Requirement: Removals name their effect on shared albums
The scope read for removing an option and for deleting a field SHALL count how many of the affected albums outside Trash are in what the owner shares, directly or through a folder above. When there are some, the confirmation and an AI client's approval SHALL say that the people the owner shares them with stop seeing it (FR-03.17, FR-03.18, FR-07.14).

#### Scenario: A shared album chooses the option
- **WHEN** the owner removes "Calm", chosen on two albums, one in a shared list
- **THEN** the confirmation says 1 of these albums is in what they share, and the people they share it with stop seeing 'Calm' on it
