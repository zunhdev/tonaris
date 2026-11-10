# Spec Delta

## ADDED Requirements

### Requirement: Editors edit a share in the app
On the desktop, a share the person can edit SHALL open with the collection's own views and editing tools, naming its owner, and their changes and the owner's SHALL reach each other without reloading (FR-07.18, FR-07.19, X-08). The sidebar SHALL keep showing the person's own collection.

#### Scenario: Building a list together
- **WHEN** Anna, who can edit "Metal", renames its list "Doom" while Denis has it open
- **THEN** Denis sees the new name without reloading, and an album Denis adds appears in Anna's view

#### Scenario: Shown as editable
- **WHEN** Anna opens "Doom" from Shared with me
- **THEN** it reads "Can edit · Shared by Denis", and Editing mode offers Rename

### Requirement: An editor who loses access is told
When an editor can no longer edit a share they have open, the view SHALL say so, or say it is no longer available, and edits not yet saved SHALL be reported, not lost silently (FR-07.18, FR-09.3).

#### Scenario: Access removed while editing
- **WHEN** Denis removes Anna's access while she has "Doom" open
- **THEN** her view says it's no longer available
