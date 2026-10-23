# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard shortcuts move around the workspace
The workspace SHALL offer DS-78's navigation shortcuts:
- G then H, U, T or S for the root, Unsorted, Trash or Settings → Preferences;
- `[` to hide or show the sidebar;
- `V` for the current view's View options;
- `M` to move the focused folder or list;
- `E` to switch between Viewing and Editing mode;
- `?` for a reference of the shortcuts that work.

Shortcuts SHALL be off while a text field has focus. The reference SHALL also open from the account menu.

#### Scenario: Going to Unsorted
- **WHEN** an owner presses G then U
- **THEN** Unsorted opens

#### Scenario: Going to Settings
- **WHEN** an owner presses G then S
- **THEN** Settings → Preferences opens

#### Scenario: Shortcuts wait while typing
- **WHEN** an owner types "g u" into a name field
- **THEN** the text is typed and nothing else happens
