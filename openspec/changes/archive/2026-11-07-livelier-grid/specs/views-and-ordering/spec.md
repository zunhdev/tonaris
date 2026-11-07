# Spec Delta

## ADDED Requirements

### Requirement: A card shows the album open in the inspector
In a grid of album cards, the card of the album the inspector shows SHALL stand out: an accent ring around its cover, set a little apart from it, and its title on an accent highlight (FR-05, DS-22, TON-167). Every other card SHALL look as before, and opening another album SHALL move the mark to its card.

#### Scenario: Opening an album from its card
- **WHEN** an owner viewing a list as cards clicks the card of 'Houses of the Holy'
- **THEN** that card's cover has the accent ring and its title the accent highlight, and no other card has them

#### Scenario: Closing the inspector
- **WHEN** the owner then presses Esc
- **THEN** no card has the ring or the highlight

### Requirement: A card responds to a hovering pointer
On a device whose pointer can hover, pointing at an album card SHALL show a raised surface behind its cover and text (FR-05, DS-22, TON-167). A touch screen SHALL show none, even after a tap. The surface SHALL never take a click: the card's service links SHALL still open their service and not the inspector.

#### Scenario: Pointing at a card
- **WHEN** an owner points at an album's card
- **THEN** a raised surface shows behind the card, and goes when the pointer leaves

#### Scenario: A service link under the hover
- **WHEN** an owner points at a card and clicks its Tidal link
- **THEN** Tidal opens the album, and the inspector stays closed

#### Scenario: A tap on a phone
- **WHEN** a person on a phone, viewing a list as cards, taps a card's Spotify link
- **THEN** Spotify opens the album, and the card shows no raised surface

### Requirement: A card labels releases other than studio albums
An album card's cover SHALL carry a small label naming its release type when that type is EP, Single or Compilation, and "Live" when the album is live, joined as in "Compilation · Live" (FR-05.9, DS-22, TON-167). An album of type Album, or of unknown type, that isn't live SHALL have no label. Guest pages' grids SHALL show the same labels.

#### Scenario: A live compilation and a studio album
- **WHEN** a list viewed as cards holds the live compilation 'How the West Was Won' and the album 'Houses of the Holy'
- **THEN** the first card's cover reads "Compilation · Live", and the second has no label

#### Scenario: An EP on a guest page
- **WHEN** a guest views a shared list as a grid, holding the EP 'Feel Good Lost'
- **THEN** its cover reads "EP"

#### Scenario: On a phone
- **WHEN** a person on a phone views a list holding a live album as cards
- **THEN** its cover reads "Live", and the page is no wider than the screen
