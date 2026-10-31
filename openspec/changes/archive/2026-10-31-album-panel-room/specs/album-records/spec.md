# Spec Delta

## ADDED Requirements

### Requirement: The inspector's artwork fills its width
The inspector's artwork SHALL fill the panel's width, up to 500 px, staying a square that never shifts the layout (DS-23, DS-46, TON-124).

#### Scenario: A wide panel
- **WHEN** an owner widens the inspector to 560 px
- **THEN** its artwork is 500 px wide

### Requirement: Find sits beside the Artwork URL
Find artwork's button SHALL read "Find" and sit to the right of the Artwork URL field, in the inspector and in the manual entry form, named "Find artwork" for assistive technology (FR-03.4, TON-124).

#### Scenario: Editing an album's artwork
- **WHEN** an owner opens an album in Editing mode
- **THEN** "Find" is on the Artwork URL field's row, to its right
