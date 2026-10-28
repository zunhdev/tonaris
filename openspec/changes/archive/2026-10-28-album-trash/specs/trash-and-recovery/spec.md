## ADDED Requirements

### Requirement: Deleting an album from the collection is confirmed
Deleting an album from the collection SHALL be confirmed, explaining that it leaves every list and Unsorted and goes to Trash for 30 days (FR-14.1). It SHALL be its own unit. Its information, links, field values and former entries SHALL be kept while it is in Trash, and it SHALL leave active views at once.

#### Scenario: Confirmed
- **WHEN** the owner deletes "Dopesmoker", in "Doom", and confirms
- **THEN** it leaves "Doom" and Unsorted, and is in Trash as its own unit

### Requirement: A restored album returns to its active lists
Restoring an album SHALL bring back its entries in still-active lists (FR-14.2). Entries in lists in Trash SHALL be reported as skipped with their reason, and lists and folders SHALL NOT be restored. With no entry to bring back, the album SHALL enter Unsorted.

#### Scenario: A list in Trash meanwhile
- **WHEN** "Dopesmoker" was in "Doom" and "Later", "Later" went to Trash, and the owner restores "Dopesmoker"
- **THEN** it is back in "Doom", and "Later" is reported as skipped because it is in Trash

### Requirement: Restoring a second record of the same album pauses
If restoring would make a second active record confidently identified as the same album, the restore SHALL pause, naming the active record, and nothing SHALL change: both records and their entries stay, and the original stays in Trash with its expiry (FR-14.3). The owner SHALL keep the active record, or delete it into Trash, confirmed, and restore.

#### Scenario: Captured again meanwhile
- **WHEN** "Dopesmoker" is in Trash, the owner captured it again as a new record, and then restores the first
- **THEN** the restore pauses, showing both, and neither changes until the owner chooses
