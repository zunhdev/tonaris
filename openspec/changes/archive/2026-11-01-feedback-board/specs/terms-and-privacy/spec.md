# Spec Delta

## ADDED Requirements

### Requirement: The privacy notice describes the feedback board
The privacy notice SHALL say that the feedback board runs on Fider, that it receives the display name and email of someone who signs in to it with Tonaris, that anyone can read what they post there with their name but never their email, and that deleting the Tonaris account doesn't remove it (FR-11.14, FR-11.15). This text change SHALL be a new terms version, so members agree once more (TS-134).

#### Scenario: Reading about the board
- **WHEN** someone reads `/privacy`
- **THEN** it names Fider and says what the board receives and shows

#### Scenario: Members agree again
- **WHEN** a member who agreed to the previous version opens Tonaris
- **THEN** the one-time agreement screen shows before their collection
