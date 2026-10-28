# Spec Delta

## Purpose

Finding the person's own folders, lists and albums by name, title or artist, from anywhere in the signed-in app, and opening them (FR-12). Shared content and server search join this capability later.

## ADDED Requirements

### Requirement: Search covers the active owned collection
Search SHALL cover the signed-in person's active owned collection, Unsorted included (FR-12.1). Content in Trash SHALL NOT appear in results.

#### Scenario: Unsorted is searched
- **WHEN** the owner searches "bleach" and the album "Bleach" is in no list
- **THEN** "Bleach" appears under Albums, located in "Unsorted"

#### Scenario: Trash is not searched
- **WHEN** the owner moves the list "Doom" to Trash and then searches "doom"
- **THEN** no result for "Doom" appears

### Requirement: One quick search is available throughout the app
A single Command-K-style search SHALL open from anywhere in the signed-in app with the platform shortcut, ⌘K or Ctrl+K, and with an accessible on-screen control (FR-12.2). The shortcut SHALL work while a text field has focus. The palette SHALL follow the combobox and listbox pattern, and SHALL fill the screen on narrow screens.

#### Scenario: Opened by shortcut while typing elsewhere
- **WHEN** a text field has focus and the owner presses ⌘K
- **THEN** the search palette opens with its field focused

#### Scenario: Opened from the sidebar
- **WHEN** the owner activates the sidebar's Search item
- **THEN** the search palette opens

### Requirement: Search opens what it finds
Search SHALL be independent of the current location and SHALL open what it finds (FR-12.2): a folder or list in its view, and an album in its containing view with the inspector, or on its own page with ⌘Enter.

#### Scenario: Opening an album
- **WHEN** the owner chooses the album "Bleach", which is in the list "90s" inside the folder "Grunge"
- **THEN** the "90s" view opens with "Bleach" in the inspector

#### Scenario: Opening an album on its own
- **WHEN** the owner presses ⌘Enter on the album "Bleach"
- **THEN** the album's own page opens

### Requirement: Search matches only names, titles and artist credits
Search SHALL match only folder names, list names, album titles and album artist credits as saved (FR-12.4). It SHALL NOT match descriptions, custom fields or other metadata. Results SHALL be grouped as Folders, Lists and Albums, at most 8 per group until the person asks to see all, and each result SHALL show its location: a container's parent path, or "Collection" at the top; an album's first list's path with the count of its other lists, or "Unsorted".

#### Scenario: A description doesn't match
- **WHEN** the list "Doom" has the description "slow and heavy" and the owner searches "heavy"
- **THEN** "Doom" doesn't appear

#### Scenario: Location shown
- **WHEN** the owner searches "doom" and the list "Doom" is inside the folder "Metal"
- **THEN** the result reads "Doom", located in "Metal"

#### Scenario: More than 8 matches
- **WHEN** 12 albums match
- **THEN** 8 show, with "Show all 12", which shows the rest

### Requirement: Matching is partial, case- and accent-insensitive
Matching SHALL be case- and accent-insensitive and partial, with no typo tolerance (FR-12.5): "metal" matches "Metallica", and "bjork" matches "Björk". Results SHALL show the original spelling, with the matched part highlighted. Within a group, names starting with the query SHALL come first, then those with a word starting with it, then the rest, each alphabetically.

#### Scenario: Accent-insensitive with highlight
- **WHEN** the owner searches "bjork"
- **THEN** the album by "Björk" appears, with "Björk" highlighted

#### Scenario: No typo tolerance
- **WHEN** the owner searches "metalica"
- **THEN** "Metallica" doesn't appear

#### Scenario: Prefix first
- **WHEN** the lists "Classic Doom" and "Doom" exist and the owner searches "doom"
- **THEN** "Doom" comes before "Classic Doom"

### Requirement: Search keeps up with typing
Results SHALL update within 50 ms of each keystroke at 5,000 owned albums (FR-12.6, provisional Q-01 target).

#### Scenario: A full collection
- **WHEN** the collection holds 5,000 albums and the owner types a query
- **THEN** each keystroke's results are ready within 50 ms
