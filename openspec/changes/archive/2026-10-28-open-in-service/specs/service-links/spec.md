## ADDED Requirements

### Requirement: Opening an album is an explicit choice of service
Opening an album SHALL offer only the services it has links for, and the person SHALL choose one every time (FR-06.5): no service is preselected or remembered, and a single link is still a choice. The choice SHALL be offered from an album's row and from the keyboard, for the inspector's or the focused album.

#### Scenario: Two links
- **WHEN** an owner opens the chooser for an album with Spotify and Tidal links
- **THEN** it offers "Open in Spotify" and "Open in Tidal", in that order, and nothing else

#### Scenario: One link
- **WHEN** an album has only an Apple Music link
- **THEN** the chooser still opens, offering "Open in Apple Music"

#### Scenario: No links
- **WHEN** an owner asks to open an album without links
- **THEN** no chooser opens, and they are told the album has no links

### Requirement: A service opens in its app where possible, else on its web page
Choosing a service SHALL open the same release on that service (FR-06.6). On mobile, it SHALL open the canonical link, which the service's app takes when it is installed. On desktop, it SHALL open the service's web page, and SHALL offer the service's desktop app as a second choice. It SHALL never open another service or another release.

#### Scenario: Desktop
- **WHEN** an owner on desktop chooses "Open in Spotify" for an album
- **THEN** the album's canonical Spotify page opens in a new tab, and "App" beside it opens `spotify:album:{id}`

#### Scenario: Mobile
- **WHEN** an owner on a phone chooses Tidal for an album
- **THEN** the album's canonical Tidal link opens

### Requirement: A destination that may not have opened is explained
When the desktop app may not have opened, the chooser SHALL say so and offer the same service's web page, without switching service (FR-06.6, FR-13.1).

#### Scenario: The app didn't take over
- **WHEN** an owner chooses a service's app and the page still has the focus 2 s later
- **THEN** the chooser says the app may not be installed, and offers that service's web page only
