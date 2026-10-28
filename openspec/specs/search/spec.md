# search Specification

## Purpose

Finding the person's own folders, lists and albums by name, title or artist, from anywhere in the signed-in app, and opening them (FR-12). Shared content and server search join this capability later.

## Requirements

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

### Requirement: Server search matches the app's
Search through the API SHALL use the same scope, matched fields, matching and order as the app's (X-02, FR-12.4, FR-12.5). Results SHALL come grouped as folders, lists and albums, each group with its total. Each result SHALL carry its location: a container's folder path, and an album's lists with their paths, or none for Unsorted. MCP's search SHALL return albums in the same order. One shared fixture SHALL be run against both the app's and the server's search.

#### Scenario: Same answer from app and API
- **WHEN** the parity fixture's collection is searched for "doom" in the app and through the API
- **THEN** both return the same folders, lists and albums, in the same order, with the same locations

#### Scenario: Accent-insensitive on the server
- **WHEN** an API client searches "bjork"
- **THEN** the album by "Björk" is returned with its original spelling

#### Scenario: MCP orders like the app
- **WHEN** an assistant searches "doom" through MCP
- **THEN** the albums come in the order the app shows them

### Requirement: Server search covers only the caller's active collection
Server search SHALL return only the caller's active owned content, Unsorted included (FR-12.1). Content in Trash and other accounts' content SHALL NOT appear.

#### Scenario: Trash on the server
- **WHEN** the owner's list "Sludge" is in Trash and an API client searches "sludge"
- **THEN** no result is returned

#### Scenario: Another account
- **WHEN** another account has a list "Doom" and the owner searches "doom" through the API
- **THEN** only the owner's own content is returned

### Requirement: Server search answers within 300 ms
Server search SHALL answer within 300 ms on the reference workload of 5,000 albums (FR-12.6, provisional Q-01 target).

#### Scenario: The reference workload
- **WHEN** the reference account with 5,000 albums is searched through the server
- **THEN** each query is answered within 300 ms
