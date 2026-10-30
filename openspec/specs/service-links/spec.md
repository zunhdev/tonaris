# service-links Specification

## Purpose
An album's links to Spotify, Apple Music, Qobuz and Tidal: at most one per service, kept as canonical URLs, synced to every session of the owner, and added, replaced or removed by hand with the same reading capture uses (FR-06.2–FR-06.4).

## Requirements

### Requirement: An album has at most one link per service, kept canonical
A saved album SHALL have at most one current link for each of Spotify, Apple Music, Qobuz and Tidal (FR-06.2). A link SHALL be stored as its canonical URL (TS-40), whatever form it was pasted in, and links SHALL be optional for every album.

#### Scenario: A pasted variant is stored canonical
- **WHEN** an owner adds `https://open.spotify.com/intl-de/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=abc` as an album's Spotify link
- **THEN** the album's Spotify link is `https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv`

#### Scenario: Replacing keeps one link
- **WHEN** an album has a Spotify link and the owner sets another Spotify link
- **THEN** the album has only the new Spotify link, and its links for other services are unchanged

#### Scenario: A short link is followed
- **WHEN** an owner adds a `spotify.link` short link that leads to an album
- **THEN** the album's Spotify link is that album's canonical URL

### Requirement: Owners add, replace and remove links by hand
An owner SHALL add, replace and remove an album's links as editable metadata (FR-06.3), in the inspector in Editing mode and in manual entry. A link SHALL be refused, with its reason and nothing changed, when it isn't a supported album or track link, or is another service's link than the one being set (X-05). Only the owner SHALL edit an album's links.

#### Scenario: Adding a link
- **WHEN** an owner adds an Apple Music album link to an album without one
- **THEN** the album has that Apple Music link

#### Scenario: Removing a link
- **WHEN** an owner removes an album's Tidal link
- **THEN** the album has no Tidal link, and its other links are unchanged

#### Scenario: Another service's link is refused
- **WHEN** an owner sets an album's Spotify link to an Apple Music link
- **THEN** it is refused with a reason naming the services, and the album's links are unchanged

#### Scenario: Unsupported input is refused
- **WHEN** an owner sets an album's Qobuz link to text that isn't a Qobuz album or track link
- **THEN** it is refused with the reason link capture gives for that input, and nothing changes

#### Scenario: Manual entry saves links with the album
- **WHEN** an owner adds an album by hand with its title, artist, year and a Spotify link
- **THEN** the album is saved with that Spotify link

#### Scenario: Someone else's album
- **WHEN** a person sets a link on an album they don't own
- **THEN** it is refused, and nothing changes

### Requirement: A link changed elsewhere is a conflict
A link edit SHALL name the link the person last saw. When the album's link for that service has changed since, the edit SHALL be a conflict that changes nothing and shows both values for review (TS-21, FR-09.4). Setting the link it already has SHALL change nothing.

#### Scenario: Replaced in another session
- **WHEN** a session replaces an album's Spotify link while another session, which still shows the old one, removes it
- **THEN** the removal is a conflict, and the album keeps the replacement

#### Scenario: The same link again
- **WHEN** an owner sets an album's Spotify link to the URL it already has
- **THEN** nothing changes, and the edit is confirmed

### Requirement: A kept link changes only through an explicit edit
When capture keeps an album's link and reports a different pasted one (FR-06.4), the album's link SHALL change only when the person replaces it. Replacing it with the reported alternative SHALL be an ordinary link edit, and the membership the capture applied SHALL stay.

#### Scenario: Replacing with the reported alternative
- **WHEN** a capture kept an album's Spotify link and reported the pasted one, and the owner then sets the album's Spotify link to the pasted one
- **THEN** the album's Spotify link is the pasted one, and the album stays in the list the capture added it to

### Requirement: Links reach every session of the owner
An album's links SHALL reach every session of its owner: in the data a session loads, and as they change, whether a person, an edit elsewhere or a capture changed them (FR-09.1).

#### Scenario: A captured link reaches the app
- **WHEN** a capture saves an album with its Spotify link
- **THEN** the owner's open sessions show the album's Spotify link without reloading

#### Scenario: An edit reaches another session
- **WHEN** an owner removes an album's Qobuz link in one session
- **THEN** their other open sessions no longer show it

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
