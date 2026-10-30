# mobile-web Specification

## Purpose

On a phone, the workspace is for browsing: drill-down navigation, rows that fit the screen, and an album's details in a sheet, with the desktop's tasks left to the desktop (section 2.2, X-04, DS-110).

## Requirements

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

### Requirement: Tonaris installs on a phone's home screen
The web app SHALL link a web app manifest that meets Chrome's install criteria: the name "Tonaris", 192 and 512 px icons with a maskable one, the start URL `/c` and standalone display (section 2.2). On iOS, Add to Home Screen SHALL get Tonaris's icon and open it full screen. Opening the installed app SHALL still need a connection (section 2.3).

#### Scenario: Android Chrome
- **WHEN** a person opens Tonaris in Chrome on Android
- **THEN** Chrome loads its manifest, and installing opens it standalone at the collection, or at sign-in when signed out

#### Scenario: iOS Safari
- **WHEN** a person adds Tonaris to the home screen from Safari on iOS
- **THEN** the home screen shows Tonaris's icon, and the app opens full screen
