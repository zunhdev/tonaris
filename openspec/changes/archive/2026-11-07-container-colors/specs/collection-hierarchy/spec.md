# Spec Delta

## MODIFIED Requirements

### Requirement: Folders and lists have a menu in the sidebar
Each folder and list in the sidebar SHALL offer a menu with New list, New folder, Rename, Move to…, Share…, Color and Delete…, opened from its ⋯ with the pointer or with Shift+F10 or the Menu key (FR-01.1, FR-01.3, FR-01.4, FR-01.11). New list and New folder SHALL create inside a folder, and beside a list (TON-120). Each item SHALL run what its shortcut runs on that folder or list, and show the shortcut. While offline, the items SHALL be disabled with the reason (DS-81).

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

## ADDED Requirements

### Requirement: Folders and lists have colors
An owner SHALL give a folder or list one of eight colors, or none, from its menu's Color submenu or the palette's Color… (FR-01.19, DS-27, TON-175). Setting a color SHALL be an ordinary change: it switches to Editing mode, reaches the owner's other sessions, and waits offline like other changes.

#### Scenario: Coloring a folder from its menu
- **WHEN** an owner chooses Color → Orange in the folder 'Metal''s menu
- **THEN** 'Metal''s icon turns orange, Editing mode is on, and the color is kept after a reload

#### Scenario: Coloring a list from the palette
- **WHEN** an owner focuses the list 'Doom', opens the palette, runs Color… and chooses Teal
- **THEN** 'Doom''s icon turns teal

### Requirement: A folder's color shows on what's inside
A folder or list without its own color SHALL show the nearest folder's above it: in the sidebar's tree, in folder rows and cards, and on the album panel's list chips (FR-01.19, DS-27, DS-46, TON-175).

#### Scenario: A list inside a colored folder
- **WHEN** the folder 'Metal' is orange and its list 'Doom' has no color
- **THEN** 'Doom''s icon is orange too, and an album in 'Doom' shows an orange 'Doom' chip

#### Scenario: Its own color wins
- **WHEN** the owner then colors 'Doom' teal
- **THEN** 'Doom' is teal and 'Metal' stays orange
