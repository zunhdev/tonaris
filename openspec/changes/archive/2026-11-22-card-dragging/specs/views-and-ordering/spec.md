# Spec Delta

## ADDED Requirements

### Requirement: Cards are dragged to rearrange
Under manual order, in Editing mode on a computer, a person SHALL rearrange album cards, and folder and list cards, by dragging the card itself (FR-05.2, DS-49, TON-322). A line in the gap beside the card under the pointer SHALL show where it would land, and a drop SHALL move it there, announced and kept as other moves are. A press that moves less than 6 px SHALL still open the card. In Viewing mode and on phones, no card SHALL drag.

#### Scenario: Dragging an album card
- **WHEN** an owner in Editing mode drags the third album card of a list in manual order onto the left half of the first card
- **THEN** it becomes the first, "Moved {title} to position 1 of 3" is announced, and the order is the same after a reload

#### Scenario: Dropping in the gap
- **WHEN** an owner in Editing mode drags the first album card of a list in manual order into the gap after the second card
- **THEN** it becomes the second

#### Scenario: Dragging a folder card
- **WHEN** an owner in Editing mode drags the list card 'Doom' onto the right half of the folder card 'Metal', at the root in manual order
- **THEN** 'Doom' comes right after 'Metal'

#### Scenario: A click still opens
- **WHEN** an owner in Editing mode clicks an album card in a list in manual order
- **THEN** the album panel opens on that album, and nothing moves

#### Scenario: No dragging while viewing
- **WHEN** an owner in Viewing mode drags an album card in a list in manual order onto another card
- **THEN** nothing moves
