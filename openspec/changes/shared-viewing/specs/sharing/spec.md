# Spec Delta

## ADDED Requirements

### Requirement: Signed-in viewers open shared content in the app
A signed-in person SHALL open a folder or list shared with them in the app's shell, view-only (DS-70): a pill names the owner, and there are no editing controls (FR-07.17). The content SHALL stay current while open, and SHALL say it is no longer available once access ends (FR-07.11).

#### Scenario: Opening from Shared with me
- **WHEN** a person opens "Doom" from Shared with me
- **THEN** it shows "View only · Shared by Denis", its albums, and no mode toggle or Share button

#### Scenario: Access ends while open
- **WHEN** the owner removes the person's access while "Doom" is open
- **THEN** the page says it is no longer available

### Requirement: Viewers' presentation is their own
A viewer's sorting, grouping, layout and arrangement of shared content SHALL be saved for them and synchronized across their devices, and SHALL never change the owner's (FR-07.17, FR-05.2, AC-16). Account defaults SHALL apply to shared views not visited yet, and remembered choices SHALL win.

#### Scenario: Sorted by name
- **WHEN** a viewer sorts the shared list "Doom" by name
- **THEN** it stays sorted by name for them, on every device, and the owner's "Doom" keeps its own sort

#### Scenario: Their own arrangement
- **WHEN** a viewer in manual order moves an album up with ⌥↑
- **THEN** their order changes and the owner's arrangement doesn't
