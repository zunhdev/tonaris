# Spec Delta

## ADDED Requirements

### Requirement: A destination list is found by typing
The List field of the capture dialog and of the manual entry form SHALL show the chosen list's path, or "No list (goes to Unsorted)", and open a popover finding the owner's lists as "Add to a list" does (FR-02.2, FR-02.4, FR-12.5, DS-47, DS-48, TON-181). Before typing, "No list" SHALL come first. Choosing SHALL set the field and close the popover; Esc SHALL close only the popover.

#### Scenario: A list found by a word of its name
- **WHEN** an owner opens the List field in "Add albums", types "ЗЕМФ" and presses Enter
- **THEN** the field shows "Русский рок › 4 2000-2010-е › Земфира", the popover closes, and the dialog stays open

#### Scenario: No list
- **WHEN** an owner chooses "No list (goes to Unsorted)" in the List field and adds a link
- **THEN** the album goes to Unsorted
