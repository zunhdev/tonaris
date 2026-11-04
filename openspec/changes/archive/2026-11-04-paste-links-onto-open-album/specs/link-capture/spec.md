# Spec Delta

## MODIFIED Requirements

### Requirement: Pasted links are captured where they are pasted
On desktop, an owner SHALL add albums by pasting links of the launch services anywhere in the workspace while no text field has focus and no album is open in the inspector (FR-02.1). Each pasted line that looks like a link SHALL become one capture. In a list, the albums SHALL go to that list; elsewhere they SHALL go to Unsorted, with adding to a list offered (FR-02.2). Pasting SHALL switch to Editing first, and wait while offline. Text with no link SHALL be ignored.

#### Scenario: Pasting in a list
- **WHEN** an owner viewing the list "Grunge" pastes a Spotify album link
- **THEN** the album is captured into "Grunge"

#### Scenario: Pasting elsewhere
- **WHEN** an owner viewing their collection's root pastes an Apple Music album link
- **THEN** the album is saved without a list, appears in Unsorted, and "Add to list…" is offered

#### Scenario: Several links at once
- **WHEN** an owner pastes three links on three lines
- **THEN** three captures start, reported together as one batch

#### Scenario: Typing in a field
- **WHEN** an owner pastes a link into a text field
- **THEN** the field gets the text, and nothing is captured

#### Scenario: An album open in the inspector
- **WHEN** an owner with an album open in the inspector pastes a Tidal album link
- **THEN** nothing is captured, and the link goes to the open album's Tidal link
