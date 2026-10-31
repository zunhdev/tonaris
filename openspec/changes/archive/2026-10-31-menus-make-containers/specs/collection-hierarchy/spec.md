# Spec Delta

## MODIFIED Requirements

### Requirement: Owners create and rename folders and lists in the sidebar
An owner SHALL create a list (N) or folder (⇧N) inside the focused folder or the current view's folder, beside the focused or viewed list, or at the root (FR-01.1, DS-78). The "+" menu beside Collection SHALL create them at the root, whatever is focused or on view (TON-120). F2 SHALL rename the focused one (FR-01.3). Both edit the name inline. A blank, overlong or sibling-taken name SHALL keep the editor open with its reason (DS-107), sending nothing (X-05). While offline both SHALL be disabled (DS-81).

#### Scenario: Creating a folder and a list in it by keyboard
- **WHEN** an owner presses ⇧N, types "Metal" and Enter, then with 'Metal' focused presses N, types "Doom" and Enter
- **THEN** the folder 'Metal' holds the new list 'Doom', both saved

#### Scenario: The "+" menu creates at the top level
- **WHEN** an owner viewing the list 'Doom' in the folder 'Metal' chooses New list in the "+" menu beside Collection and enters "Later"
- **THEN** 'Later' is created at the top level, not in 'Metal'

#### Scenario: Renaming by keyboard
- **WHEN** an owner focuses the list 'Doom', presses F2, types "Funeral doom" and Enter
- **THEN** the list is renamed, and its breadcrumbs and heading follow

#### Scenario: A taken name is caught before sending
- **WHEN** an owner creates a list at the root named like an existing list 'Later'
- **THEN** the editor stays open saying "'Later' already exists at the top level. Choose another name.", and nothing is sent

#### Scenario: Offline
- **WHEN** the workspace is offline
- **THEN** the "+" menu is disabled with "You're offline", and N, ⇧N and F2 do nothing

### Requirement: Folders and lists have a menu in the sidebar
Each folder and list in the sidebar SHALL offer a menu with New list, New folder, Rename, Move to…, Share… and Delete…, opened from its ⋯ with the pointer or with Shift+F10 or the Menu key (FR-01.1, FR-01.3, FR-01.4, FR-01.11). New list and New folder SHALL create inside a folder, and beside a list, in its folder or at the root (TON-120). Each item SHALL run what its shortcut runs on that folder or list, and show the shortcut. While offline, the items SHALL be disabled with the reason (DS-81).

#### Scenario: Creating inside a folder
- **WHEN** an owner chooses New list in the folder 'Metal''s menu and enters "Sludge"
- **THEN** 'Metal' holds the new list 'Sludge'

#### Scenario: Creating beside a list
- **WHEN** an owner chooses New folder in the menu of the list 'Doom', in the folder 'Metal', and enters "Drone"
- **THEN** 'Metal' holds the new folder 'Drone', beside 'Doom'

#### Scenario: Renaming with the mouse
- **WHEN** an owner opens the ⋯ menu on the list 'Doom' and chooses Rename
- **THEN** the name's editor opens in place, as F2 opens it

#### Scenario: Deleting with the mouse
- **WHEN** an owner chooses Delete… in a list's menu
- **THEN** the list goes to Trash with Undo, as ⌫ does

#### Scenario: From the keyboard
- **WHEN** an owner presses Shift+F10 on a focused folder and then Escape
- **THEN** the folder's menu opens, then closes, and the focus is back on the folder
