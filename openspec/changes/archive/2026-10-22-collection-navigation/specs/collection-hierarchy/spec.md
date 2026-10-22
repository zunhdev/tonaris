# Spec Delta

## ADDED Requirements

### Requirement: Owners create and rename folders and lists in the sidebar
An owner SHALL create a list (N) or folder (⇧N), or use the "+" menu, inside the focused folder or the current view's folder, or at the root (FR-01.1, DS-78). F2 SHALL rename the focused one (FR-01.3). Both edit the name inline. A blank, overlong or sibling-taken name SHALL keep the editor open with its reason (DS-107), sending nothing (X-05). While offline both SHALL be disabled (DS-81).

#### Scenario: Creating a folder and a list in it by keyboard
- **WHEN** an owner presses ⇧N, types "Metal" and Enter, then with 'Metal' focused presses N, types "Doom" and Enter
- **THEN** the folder 'Metal' holds the new list 'Doom', both saved

#### Scenario: Renaming by keyboard
- **WHEN** an owner focuses the list 'Doom', presses F2, types "Funeral doom" and Enter
- **THEN** the list is renamed, and its breadcrumbs and heading follow

#### Scenario: A taken name is caught before sending
- **WHEN** an owner creates a list at the root named like an existing list 'Later'
- **THEN** the editor stays open saying "'Later' already exists at the top level. Choose another name.", and nothing is sent

#### Scenario: Offline
- **WHEN** the workspace is offline
- **THEN** the "+" menu is disabled with "You're offline", and N, ⇧N and F2 do nothing

### Requirement: A failed create or rename can be edited
When the server rejects a folder or list's creation or renaming, its toast, its Activity entry and its batch report item SHALL offer Edit (DS-80, FR-13.2). Edit reopens the inline editor, with the name that was attempted. Saving it SHALL clear the failure.

#### Scenario: Editing a rejected name
- **WHEN** a new list's name turns out taken on the server, and the owner chooses Edit, changes the name and presses Enter
- **THEN** the list is saved under the new name, and the failure is no longer listed
