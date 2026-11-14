## ADDED Requirements

### Requirement: Owners see what they share
The sidebar tree and the owner's folder rows and cards SHALL show a glyph on each folder or list the owner shares: people for an open invitation, a link for a live link, or both. A folder or list shared only through a folder above SHALL show a dimmer glyph. The glyph SHALL have words for assistive technology (DS-27, DS-31, DS-41).

#### Scenario: A shared folder and the list inside
- **WHEN** the owner turns on the link of the folder "Metal", which holds the list "Doom"
- **THEN** "Metal" shows the link glyph, read as "shared by link", and "Doom" shows it dimmer, "shared by link through a folder above"

#### Scenario: Nothing shared
- **WHEN** a list isn't shared, and no folder above it is
- **THEN** it shows no glyph
