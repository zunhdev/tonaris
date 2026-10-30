# Spec Delta

## ADDED Requirements

### Requirement: Folders and lists have a menu in the sidebar
Each folder and list in the sidebar SHALL offer a menu with Rename, Move to…, Share… and Delete…, opened from its ⋯ with the pointer or with Shift+F10 or the Menu key (FR-01.3, FR-01.4, FR-01.11). Each item SHALL run what its shortcut runs on that folder or list, and show the shortcut. While offline, the items SHALL be disabled with the reason (DS-81).

#### Scenario: Renaming with the mouse
- **WHEN** an owner opens the ⋯ menu on the list 'Doom' and chooses Rename
- **THEN** the name's editor opens in place, as F2 opens it

#### Scenario: Deleting with the mouse
- **WHEN** an owner chooses Delete… in a list's menu
- **THEN** the list goes to Trash with Undo, as ⌫ does

#### Scenario: From the keyboard
- **WHEN** an owner presses Shift+F10 on a focused folder and then Escape
- **THEN** the folder's menu opens, then closes, and the focus is back on the folder

### Requirement: The view's header renames its folder or list
In Editing mode, the header of a folder or list SHALL offer Rename beside Delete, opening the name's editor in the sidebar (FR-01.3).

#### Scenario: Renaming from the header
- **WHEN** an owner in Editing mode chooses Rename in the list 'Doom''s header and enters "Drone doom"
- **THEN** the list is renamed, and its heading follows
