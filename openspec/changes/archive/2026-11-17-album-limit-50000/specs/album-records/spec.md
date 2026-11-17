## RENAMED Requirements

- FROM: `### Requirement: List entries are limited to 50,000`
- TO: `### Requirement: List entries are limited to 100,000`

## MODIFIED Requirements

### Requirement: List entries are limited to 100,000
An account SHALL hold at most 100,000 list entries, counting those whose list or album is in Trash until they are permanently removed (FR-15.4, TS-18; raised from 50,000 on 17 November 2026). At the limit, only a new entry SHALL be rejected, with a clear reason; existing entries, albums and lists SHALL stay fully usable.

#### Scenario: Adding past the limit
- **WHEN** an account holds 100,000 list entries, some in a list in Trash, and the owner adds an album to another list
- **THEN** it is rejected as over the limit, and removing an entry or re-adding an album already in its list still works
