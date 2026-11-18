## ADDED Requirements

### Requirement: People pick up to four favorite albums
Settings → Profile SHALL let a person pick up to four of their own albums as favorites, each found by typing its title or artist (FR-11.16, FR-12.5), reorder them and remove them, in the app only (X-03). Anyone else's album, or one that doesn't exist, SHALL be refused.

#### Scenario: Picking a favorite
- **WHEN** Denis adds a favorite and types "night"
- **THEN** "Nightfall · Candlemass" is offered, and choosing it shows it first among his favorites

#### Scenario: A fifth one
- **WHEN** Denis has four favorites
- **THEN** Settings offers no way to add another, and the server refuses five

### Requirement: Your people see your favorites by cover, title and artist
A person's favorites SHALL show on their page in People to their people only, from their side, as the About text does (FR-07.23, FR-11.16): each as its cover, title and artist, in order, and nothing else of the album or the collection. Guests, the Shared by card, exports and MCP SHALL never carry them (FR-08.4).

#### Scenario: Anna's page
- **WHEN** Denis, who accepted Anna's invitation, opens her page in People
- **THEN** he sees her favorites' covers, titles and artists, and no year or service link

### Requirement: Favorites follow their albums into Trash and back
A favorite whose album is in Trash SHALL be hidden from the person's people and marked in Settings, come back in its place when the album is restored, and be removed for good when the album is purged (FR-14, TS-74).

#### Scenario: Deleted, then restored
- **WHEN** Denis deletes his second favorite and restores it from Trash
- **THEN** it is second again on his page in Anna's People
