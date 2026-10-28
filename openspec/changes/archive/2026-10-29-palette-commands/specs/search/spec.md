# Spec Delta

## ADDED Requirements

### Requirement: The palette runs commands
The palette SHALL offer every action shortcut as a command, showing its keys (FR-12.2, DS-75, DS-78). Commands SHALL match by name below the content results, and a leading `>` SHALL list commands only. A command SHALL act as its key would, on what had the focus when the palette opened. A command that can't run SHALL say why.

#### Scenario: Commands only
- **WHEN** the owner types "> new"
- **THEN** only commands show, "New list" (N) and "New folder" (⇧N) among them

#### Scenario: Acting on the focus
- **WHEN** the owner focuses the list "Doom" in the sidebar, opens the palette and runs "Move to…"
- **THEN** the move dialog opens for "Doom"

#### Scenario: Not available
- **WHEN** nothing is focused or open and the owner looks at "Open in…"
- **THEN** it is shown as unavailable, saying to open or focus an album first

### Requirement: An empty palette shows recent items and frequent commands
With an empty query, the palette SHALL show the last 8 folders, lists and albums the person opened on this device, newest first, without deleted ones. It SHALL also show 5 frequent commands: those run most from the palette on this device, then a starter set (FR-12.2, DS-75).

#### Scenario: Recent
- **WHEN** the owner opens the list "Doom", then the album "Bleach", then opens the palette
- **THEN** "Bleach" then "Doom" lead the Recent group

#### Scenario: Frequent
- **WHEN** the owner has run "Go to Trash" from the palette more than any other command
- **THEN** it leads the frequent commands

### Requirement: Every shortcut is in the reference and the palette
The `?` reference SHALL list every shortcut the app has, and every action shortcut SHALL also be a palette command with the same keys (Q-02, DS-78).

#### Scenario: Both places
- **WHEN** the owner compares the reference with the palette's commands
- **THEN** each command in the palette is in the reference with the same keys, and each action in the reference is a command in the palette
