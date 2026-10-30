# Spec Delta

## ADDED Requirements

### Requirement: Links open the web page or the app, as the person's setting says
Each signed-in person SHALL choose whether service links open the service's web page or its app (FR-06.6). The setting SHALL be saved to the account and reach their other sessions (FR-11.8), and SHALL start as the web page. Every link they open SHALL follow it: in the chooser, the album's details and shared content. Guests' links SHALL open the web pages. A link SHALL never open another service or another release.

#### Scenario: Web pages, until the person chooses
- **WHEN** an owner who never changed the setting chooses "Open in Spotify" for an album
- **THEN** the album's canonical Spotify page opens in a new tab

#### Scenario: The apps
- **WHEN** an owner sets "Open links in" to App, then opens an album's Tidal link from the chooser or its details
- **THEN** `tidal://album/{id}` opens, on this device and after a reload

#### Scenario: A guest
- **WHEN** a guest opens a shared album's Spotify link
- **THEN** its canonical Spotify page opens, with no referrer

#### Scenario: A stale setting
- **WHEN** a session changes the setting with a base that isn't the saved setting
- **THEN** the write is a conflict, and the saved setting stays

## REMOVED Requirements

### Requirement: A service opens in its app where possible, else on its web page
**Reason**: The creator replaced "app first, then web" with a setting on 30 October 2026 (TON-104). A link now opens the web page or the app, as the person's setting says.
**Migration**: "Links open the web page or the app, as the person's setting says" covers opening a service. Accounts start with web pages, as desktop links opened before.

### Requirement: A destination that may not have opened is explained
**Reason**: With one link per service and no App choice beside the web page, nothing watches whether an app opened (TON-104). Browsers don't tell a page.
**Migration**: None. A person whose apps aren't installed sets "Open links in" back to Web page.
