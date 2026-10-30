# Spec Delta

## MODIFIED Requirements

### Requirement: Opening an album is an explicit choice of service
Opening an album SHALL offer only the services it has links for, and the person SHALL choose one every time (FR-06.5): no service is preselected or remembered, and a single link is still a choice. The choice SHALL be offered from an album's row and from the keyboard, for the inspector's or the focused album. An album's card and row SHALL also name each service it has a link for, each a link to that service, which opens it without opening the album's details.

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
