# Spec Delta

## ADDED Requirements

### Requirement: A phone browses the workspace by drilling down
Below 768 px wide, the workspace SHALL show no sidebar. Each view's top bar SHALL hold Back to the view above (none at the top), the view's name, its own controls, Search and Account (DS-110). The root screen SHALL list the collection's folders and lists, then Unsorted and Shared with me.

#### Scenario: Down and back up
- **WHEN** a person on a phone opens a folder, then a list inside it, then presses Back twice
- **THEN** they return to the folder, then to Collection

### Requirement: A phone's rows and album fit the screen
On a phone, album rows SHALL be 56 px with 44 px artwork and the artist under the title, folder and list rows at least 44 px, and nothing SHALL be wider than the screen. Tapping an album SHALL open a read-only sheet with its details and its links to open each service.

#### Scenario: Opening an album
- **WHEN** a person on a phone taps an album in a list
- **THEN** a sheet shows its details with Open links, and offers nothing to edit

### Requirement: A phone leaves the desktop's tasks to the desktop
On a phone, view options SHALL open in a bottom sheet. Trash, Settings → Custom fields and admin SHALL say they are on the desktop app (DS-110).

#### Scenario: Trash on a phone
- **WHEN** a person on a phone opens Trash
- **THEN** they read "Trash is on the desktop app."
