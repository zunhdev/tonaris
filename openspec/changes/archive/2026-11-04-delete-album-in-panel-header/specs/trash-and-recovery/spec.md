# Spec Delta

## ADDED Requirements

### Requirement: The inspector's delete is always in view
In Editing mode, the inspector SHALL offer "Delete from collection…" in its header, beside Close, in view however long the album's details are (FR-14.1, TON-162). It SHALL open the same confirmation as ⌘⌫, and SHALL show the shortcut in its tooltip.

#### Scenario: Deleting from the inspector
- **WHEN** an owner in Editing mode opens "Holy Mountain" in the inspector and chooses "Delete from collection…" in its header
- **THEN** the confirmation for "Holy Mountain" opens, without scrolling the panel

#### Scenario: Viewing mode
- **WHEN** an owner in Viewing mode opens an album in the inspector
- **THEN** the header has no "Delete from collection…"
