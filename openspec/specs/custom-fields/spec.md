

### Requirement: Deleting a field is always confirmed for its scope
Deleting a field SHALL always be confirmed, even when no album uses it (FR-03.18, X-07). The server SHALL compute its scope: the definition, its options, and the albums applying it, active and in Trash. It SHALL delete the field only with the hash of that scope as it is when deleting (TS-14). Shared-view effects SHALL join the scope with sharing.

#### Scenario: Unused, confirmed
- **WHEN** no album applies "Rating", and the owner confirms its deletion
- **THEN** "Rating" is gone

#### Scenario: The scope changed after confirming
- **WHEN** the owner confirms deleting "Mood" while two albums apply it, and a third applies it before the deletion runs
- **THEN** the deletion is refused with `field_in_use`, and nothing changes

### Requirement: Deletion removes every use, and recovery never brings it back
Deleting a field SHALL remove its definition, its options, and every album's usage and value, active and in Trash, in one transaction. No album data SHALL refer to it afterwards. Recovering an album from Trash SHALL NOT bring the field, its options or its values back (X-09). A name the field had SHALL be free for a new field, which SHALL NOT inherit anything.

#### Scenario: Used, in Trash too
- **WHEN** an active album and an album in Trash have "Mood" values, and the owner confirms deleting "Mood"
- **THEN** neither album applies "Mood", and its options are gone

#### Scenario: Recovered from Trash
- **WHEN** an album in Trash had "Mood", the owner deletes "Mood", and then recovers the album
- **THEN** the album has no "Mood"

#### Scenario: The name again
- **WHEN** the owner deletes "Mood" and creates a field named "Mood"
- **THEN** the new field is applied to no album
