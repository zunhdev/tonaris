# Spec Delta

## ADDED Requirements

### Requirement: Guests browse a shared link
Anyone with a valid link SHALL browse its folders, lists and albums without signing in, and nothing outside it (FR-07.1, FR-11.9). The page SHALL be rendered on the server and never send its token in a Referer (TS-32). An unknown, revoked or suspended link SHALL say "This link isn't available. Ask the person who shared it for a new one.", revealing nothing.

#### Scenario: A shared folder
- **WHEN** a guest opens the link of the folder "Metal", which holds the list "Doom"
- **THEN** they see "Metal", "Shared by Denis", and "Doom", and can open "Doom" to see its albums

#### Scenario: A link turned off
- **WHEN** a guest opens a link its owner turned off
- **THEN** they read "This link isn't available. Ask the person who shared it for a new one."

### Requirement: Guests open albums in their services
Each album on a guest page SHALL offer its service links (FR-06.5), opened without passing the page's address on.

#### Scenario: Open in Spotify
- **WHEN** a guest opens the chooser of an album with a Spotify link
- **THEN** it offers Spotify, which opens the album in a new tab with no referrer

### Requirement: Guest presentation lasts the visit
A guest SHALL be able to sort, group and switch layouts for the visit only (FR-11.9). The page SHALL say that these settings aren't saved, and SHALL never change the owner's.

#### Scenario: Sorted by name
- **WHEN** a guest sorts a shared list by name and reloads the tab
- **THEN** the list is still sorted by name, and a new visit starts from the defaults

### Requirement: Guest pages stay live
A guest page SHALL show the owner's current saved content (FR-07.11), updating while open, and SHALL stop showing content once its link stops working.

#### Scenario: An album added
- **WHEN** the owner adds an album to the shared list while a guest has it open
- **THEN** the album appears on the guest's page within a few seconds, without reloading
