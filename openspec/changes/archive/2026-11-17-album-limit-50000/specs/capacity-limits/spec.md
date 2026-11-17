## RENAMED Requirements

- FROM: `### Requirement: Albums count against 5,000, Trash included`
- TO: `### Requirement: Albums count against 50,000, Trash included`

## MODIFIED Requirements

### Requirement: Albums count against 50,000, Trash included
Each saved album record SHALL count once, whether active, in Unsorted or in Trash, against a limit of 50,000 (FR-15.1, FR-15.2). Memberships, links and removing an album from lists SHALL NOT use a slot. Deleting an album permanently SHALL free its slot.

#### Scenario: In Trash
- **WHEN** the owner has 49,963 active albums and 37 in Trash
- **THEN** the usage reads "50,000 of 50,000 albums · 37 in Trash"

### Requirement: At the limit, only a new album is refused
At the limit, a new album SHALL be refused from the app, capture and MCP alike, with the reason and the way to free a slot (FR-15.3). Viewing, editing, removing, restoring and re-adding SHALL keep working; restoring and re-adding reuse their slot. A batch SHALL report each item it didn't add.

#### Scenario: One more
- **WHEN** the owner, at 50,000 albums, enters a new album
- **THEN** it is refused with "You've reached 50,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more."

#### Scenario: Restoring at the limit
- **WHEN** the owner, at 50,000 albums, restores an album from Trash
- **THEN** it is restored

### Requirement: The owner sees their usage
Settings → Data SHALL show how many albums are used of the limit and how many of them are in Trash, with a bar split between the two (DS-98). Capture surfaces SHALL show a quiet notice from 95%, and the refusal's reason at the limit.

#### Scenario: The meter
- **WHEN** the owner has two albums, one of them in Trash
- **THEN** Settings → Data reads "2 of 50,000 albums · 1 in Trash"
