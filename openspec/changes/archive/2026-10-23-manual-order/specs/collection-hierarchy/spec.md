# Spec Delta

## ADDED Requirements

### Requirement: Owners move folders and lists from the interface
An owner SHALL move a folder or list from the interface on desktop (FR-01.4, FR-01.5, DS-49):
- with `M`, "Move to…", which offers the root and their folders that can take it;
- by dragging it onto a folder in the sidebar tree, or onto Collection.

The moved folder or list SHALL keep its contents, and leave its place in its old parent's arrangement. The move SHALL be announced. While offline, moving SHALL wait (DS-81). A refused move SHALL be reported and change nothing.

#### Scenario: Moving with M
- **WHEN** an owner focuses the list 'Doom' at the root, presses M and chooses the folder 'Metal'
- **THEN** 'Doom' is inside 'Metal', with its albums

#### Scenario: Moving by dragging onto the tree
- **WHEN** an owner drags the folder 'Funeral' onto Collection in the sidebar
- **THEN** 'Funeral' is at the root, with everything in it

#### Scenario: The picker offers only valid places
- **WHEN** an owner opens "Move to…" for the folder 'Metal'
- **THEN** neither 'Metal', its descendants, nor its current parent is offered
