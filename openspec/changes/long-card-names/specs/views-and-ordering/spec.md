## MODIFIED Requirements

### Requirement: Lists and Unsorted can show their albums as a grid
Lists and Unsorted SHALL offer a grid of album cards as well as rows (DS-22, DS-40). Each card shows the artwork, title, artist and year, the services the album has links for, and its save state. The layout SHALL be chosen in View options and remembered with the view's other choices (FR-11.8).

#### Scenario: Switching to the grid
- **WHEN** an owner chooses Grid in a list's View options and reloads the page
- **THEN** the list shows its albums as cards, and Unsorted still shows rows

#### Scenario: A layout kept on the device
- **WHEN** an owner had chosen Grid for a list on this device before layouts were saved to the account, and opens the workspace
- **THEN** the list shows cards, and the choice is saved to the account

#### Scenario: A card's links
- **WHEN** an album from 1995 in a list's grid has Spotify and Tidal links
- **THEN** its card's last line reads "1995", then "Spotify" and "Tidal"

## ADDED Requirements

### Requirement: A card gives a long title or artist a second line
An album card SHALL show its title on up to two lines, and its artist on two when the title fits on one, else on one; text that still doesn't fit SHALL end in an ellipsis and show whole in a tooltip under a pointer (FR-05, DS-22, TON-280). The year and service links SHALL take the card's last line. Each row of cards SHALL be as tall as its fullest card needs, so the links line up within a row.

#### Scenario: A long title
- **WHEN** an owner views a list as cards holding 'Border: Day One • 1st Mini Album' by ENHYPEN
- **THEN** its title takes two lines and its artist one

#### Scenario: A long artist under a short title
- **WHEN** an owner views a list as cards holding 'Agrippina' by "Jacobs, Akademie für Alte Musik Berlin"
- **THEN** its title takes one line and its artist two

#### Scenario: A row of short names
- **WHEN** every album in one row of cards has a title and artist that fit on one line, and another row holds a long title
- **THEN** the first row is a line shorter than the second, and each row's links line up
