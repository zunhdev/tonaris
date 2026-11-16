## MODIFIED Requirements

### Requirement: A card gives a long title or artist a second line
An album card SHALL show its title on up to two lines, and its artist on two when the title fits on one, else on one; text that still doesn't fit SHALL end in an ellipsis and show whole in a tooltip under a pointer (FR-05, DS-22, TON-280). The year and service links SHALL follow right after the artist (TON-284). Each row of cards SHALL be as tall as its fullest card needs.

#### Scenario: A long title
- **WHEN** an owner views a list as cards holding 'Border: Day One • 1st Mini Album' by ENHYPEN
- **THEN** its title takes two lines and its artist one

#### Scenario: A long artist under a short title
- **WHEN** an owner views a list as cards holding 'Agrippina' by "Jacobs, Akademie für Alte Musik Berlin"
- **THEN** its title takes one line and its artist two

#### Scenario: A row of short names
- **WHEN** every album in one row of cards has a title and artist that fit on one line, and another row holds a long title
- **THEN** the first row is a line shorter than the second, and in each card the year and links follow right after the artist
