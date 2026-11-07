# Spec Delta

## ADDED Requirements

### Requirement: A card's fanned covers sit close together
A card's fan SHALL set each cover behind 6% of the card up and to the right of the one in front, with part of it showing, and its covers SHALL fill the card: the front one at the bottom left, the back one reaching the top-right corner (FR-05.2, DS-41, TON-178).

#### Scenario: Three covers
- **WHEN** an owner opens 'Classic Rock', whose list 'Led Zeppelin' has four albums
- **THEN** its card's front cover is 88% of the card wide at the bottom left, and each cover behind sits 6% of the card up and to the right of the one in front

#### Scenario: On a guest page
- **WHEN** a guest opens a shared folder as a grid
- **THEN** its cards fan their covers the same way
