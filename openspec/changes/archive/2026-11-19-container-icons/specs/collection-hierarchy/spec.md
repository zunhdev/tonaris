# Spec Delta

## MODIFIED Requirements

### Requirement: Folders and lists have a menu in the sidebar
Each folder and list in the sidebar SHALL offer a menu with New list, New folder, Rename, Move to…, Share…, Color, Icon… and Delete…, opened from its ⋯ with the pointer or with Shift+F10 or the Menu key (FR-01.1, FR-01.3, FR-01.4, FR-01.11). New list and New folder SHALL create inside a folder, and beside a list (TON-120). Each item SHALL run what its shortcut runs on that folder or list, and show the shortcut. While offline, the items SHALL be disabled with the reason (DS-81).

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

### Requirement: Folders and lists have icons
An owner SHALL give a folder or list one of a fixed set of icons, or none, from its menu's Icon… or the palette's Icon… (FR-01.20, DS-27, TON-306). The icon SHALL replace the folder or list glyph in the sidebar's tree, folder rows and cards, and search, drawn in the folder's or list's color. Setting an icon SHALL be an ordinary change: it switches to Editing mode, reaches the owner's other sessions, and waits offline like other changes.

#### Scenario: Giving a folder an icon from its menu
- **WHEN** an owner chooses Icon… in the folder 'Metal''s menu and picks Horns
- **THEN** 'Metal' shows horns in place of the folder glyph, Editing mode is on, and the icon is kept after a reload

#### Scenario: Giving a list an icon from the palette
- **WHEN** an owner focuses the list 'Doom', opens the palette, runs Icon… and picks Skull
- **THEN** 'Doom' shows a skull

#### Scenario: Clearing an icon
- **WHEN** an owner picks None for 'Metal'
- **THEN** 'Metal' shows the folder glyph again

### Requirement: A folder's icon stays its own
A folder's icon SHALL NOT pass to what's inside: a folder or list without its own icon SHALL keep its folder or list glyph, in its inherited color (FR-01.20, DS-27, TON-306).

#### Scenario: A list inside a folder with an icon
- **WHEN** the orange folder 'Metal' has horns and its list 'Doom' has no icon
- **THEN** 'Doom' shows the list glyph, in orange
