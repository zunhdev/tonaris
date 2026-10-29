# Spec Delta

## ADDED Requirements

### Requirement: Moves preview their sharing consequences
Before a folder or list is moved on the desktop, by Move to… or by dragging onto the tree, Tonaris SHALL show the move's effective sharing consequences (FR-07.9, FR-07.14, DS-69): audiences that newly see it, audiences that no longer see it through the folders it leaves, and the direct shares it keeps, or that sharing is unchanged. It SHALL never name an audience as losing access while another access path keeps it.

#### Scenario: Into a shared folder
- **WHEN** the owner chooses a destination for "Doom" in Move to…, and the folder "Metal" there is shared with Anna
- **THEN** the dialog reads "Newly visible to Anna" before the move is made

#### Scenario: Another path remains
- **WHEN** "Doom" leaves "Metal", shared with Anna, for "Heavy", also shared with Anna
- **THEN** the preview doesn't say Anna loses access

### Requirement: Recovery previews its sharing consequences
Recovering a folder, list or album that would become visible to anyone SHALL ask first, showing the audiences it would be visible to and the direct shares that resume (FR-07.10, FR-07.14). Choosing a destination for a recovery SHALL show the consequences for that destination. Undoing a deletion just made SHALL NOT ask.

#### Scenario: A shared list from Trash
- **WHEN** the owner restores the list "Doom", shared with Anna, from Trash
- **THEN** a confirmation reads "Still shared directly with Anna", and nothing is restored until they choose Restore

#### Scenario: Nothing shared
- **WHEN** the owner restores a list nobody else could see
- **THEN** it is restored at once, as before
