## MODIFIED Requirements

### Requirement: Opening an album is an explicit choice of service
Opening an album SHALL offer only the services it has links for, and the person SHALL choose one every time (FR-06.5): no service is preselected or remembered, and a single link is still a choice. The choice SHALL be offered from an album's row and from the keyboard, for the inspector's or the focused album. An album's row SHALL also name each service it has a link for, and its card those that fit, each a link that opens it without opening the album's details.

#### Scenario: Two links
- **WHEN** an owner opens the chooser for an album with Spotify and Tidal links
- **THEN** it offers "Open in Spotify" and "Open in Tidal", in that order, and nothing else

#### Scenario: One link
- **WHEN** an album has only an Apple Music link
- **THEN** the chooser still opens, offering "Open in Apple Music"

#### Scenario: No links
- **WHEN** an owner asks to open an album without links
- **THEN** no chooser opens, and they are told the album has no links

#### Scenario: A link on a card or a row
- **WHEN** an owner clicks "Tidal" under an album's card, or in its row
- **THEN** Tidal opens where their link setting says, and the album's details don't open

## ADDED Requirements

### Requirement: A card's links that don't fit open from "+N"
An album card SHALL show the service links that fit whole after its year, in the services' order, then "+N" for the rest (FR-06.5, DS-22, TON-280). Clicking "+N" SHALL open the "Open in…" chooser with every service the album has a link for, and SHALL NOT open the album's details.

#### Scenario: Four links on a narrow card
- **WHEN** an album has Spotify, Apple Music, Qobuz and Tidal links, and its card has room for one after the year
- **THEN** the card shows "Spotify" and "+3", and clicking "+3" offers all four services
