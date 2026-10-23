# album-records Specification

## Purpose
Album records and their place in the owner's collection: one record per album, shared by every list it is in, at most one entry per list, kept when it leaves its lists, Unsorted when it is in none, and always complete with the information every album needs (FR-01.6–FR-01.10, FR-02.6, FR-02.12).

## Requirements

### Requirement: One album record is shared by every list it is in
An owner SHALL put one saved album in any number of their active lists (FR-01.6). Every entry SHALL show the same record, so its metadata is the same in each list, and an edit made from any list SHALL apply to all of them. Adding an album to a list SHALL never copy the album.

#### Scenario: An album in two lists
- **WHEN** an owner adds "Kind of Blue" to the lists "Favorites" and "Late night"
- **THEN** both lists hold the same album record, and the collection still holds one "Kind of Blue"

#### Scenario: An edit from one list shows in every list
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", and the owner corrects its year while viewing "Favorites"
- **THEN** "Late night" shows the corrected year too

### Requirement: An album appears at most once in a list
Each saved album SHALL appear at most once in a list (FR-01.7). Adding an album already in the list SHALL keep its entry and the time it was added, report that it is already in the list, and change nothing else. An entry SHALL record when the album was added.

#### Scenario: Adding an album to a list
- **WHEN** an owner adds "Kind of Blue" to the list "Favorites"
- **THEN** "Favorites" holds it, with the time it was added

#### Scenario: Adding it again keeps the entry
- **WHEN** "Kind of Blue" is already in "Favorites" and the owner adds it to "Favorites" again
- **THEN** it is reported as already in the list, and the list still holds one entry for it, with its original time and the album's metadata unchanged

### Requirement: Only active albums go into active lists the owner has
An owner SHALL add only their own active albums, and only to their own active lists (FR-01.6, X-05). Adding to a folder, to a list or album in Trash, or to a list or album that doesn't exist or is someone else's SHALL be rejected and change nothing. Removing an entry SHALL follow the same rules.

#### Scenario: Folders hold no albums
- **WHEN** an owner adds an album to a folder
- **THEN** it is rejected as an invalid destination and nothing changes

#### Scenario: Lists and albums in Trash are refused
- **WHEN** an owner adds an album to a list in Trash, or adds an album in Trash to a list
- **THEN** it is rejected because it is in Trash, and nothing changes

#### Scenario: Another person's list or album is refused
- **WHEN** a person adds an album to another person's list, or adds another person's album to their own list
- **THEN** it is rejected, and neither collection changes

### Requirement: Albums stay in the collection when their entries go
Removing an album from a list SHALL keep the album record and its other entries (FR-01.8). An album whose last entry is removed SHALL stay in the collection and appear in Unsorted. Removing an entry that isn't there SHALL change nothing. Deleting an album from the collection SHALL NOT be done by removing entries; it is a separate action (FR-14.1).

#### Scenario: Removing one of several entries
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", and the owner removes it from "Favorites"
- **THEN** it is still in "Late night", with its metadata unchanged

#### Scenario: Removing the last entry
- **WHEN** "Kind of Blue" is only in "Favorites", and the owner removes it from "Favorites"
- **THEN** the album is still in the collection, unchanged, and appears in Unsorted

#### Scenario: Removing an entry that isn't there
- **WHEN** the owner removes "Kind of Blue" from "Favorites", which doesn't hold it
- **THEN** it succeeds and nothing changes

### Requirement: Unsorted holds the owner's albums in no list
Unsorted SHALL be the owner's active albums that have no entry in an active list, maintained automatically (FR-01.9). Albums in Unsorted SHALL keep all their information, count toward the collection, and be found by search (AC-05). Adding an Unsorted album to a list SHALL reuse its record and take it out of Unsorted.

#### Scenario: A new album in no list is in Unsorted
- **WHEN** an owner saves an album without a list
- **THEN** it appears in Unsorted and is counted among the collection's albums

#### Scenario: Unsorted albums are counted and searchable
- **WHEN** an owner removes an album from its only list
- **THEN** the collection's album count is unchanged, the Unsorted count grows by one, and searching for its title finds it

#### Scenario: Adding an Unsorted album to a list
- **WHEN** an owner adds an album from Unsorted to the list "Favorites"
- **THEN** "Favorites" holds the same record, and the album no longer appears in Unsorted

### Requirement: Removing a list keeps its albums
A list that goes to Trash, directly or inside a folder, SHALL take its entries out of effect but never its albums (FR-01.10). Its albums that are in other active lists SHALL stay there, and the rest SHALL appear in Unsorted. The entries SHALL be kept, so recovering the list can restore them (TS-13).

#### Scenario: A list in Trash
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", "Blue Train" is only in "Favorites", and "Favorites" goes to Trash
- **THEN** "Kind of Blue" is still in "Late night", "Blue Train" appears in Unsorted, and both albums are unchanged

### Requirement: List entries are limited to 50,000
An account SHALL hold at most 50,000 list entries, counting those whose list or album is in Trash until they are permanently removed (FR-15.4, TS-18, decided 22 October 2026). At the limit, only a new entry SHALL be rejected, with a clear reason; existing entries, albums and lists SHALL stay fully usable.

#### Scenario: Adding past the limit
- **WHEN** an account holds 50,000 list entries, some in a list in Trash, and the owner adds an album to another list
- **THEN** it is rejected as over the limit, and removing an entry or re-adding an album already in its list still works

### Requirement: Every saved album has a title, an artist and its year
Every saved album SHALL have a title, an artist credit and an applicable year (FR-02.6). A release that isn't live SHALL have its original release year. A live release SHALL have its recording year or range, or its original release year if the recording year is unknown. Creating an album without them, or an edit that would clear one, SHALL be rejected, naming each missing value. Missing values SHALL never be filled in.

#### Scenario: A new album needs the required information
- **WHEN** an album is saved with a blank title, or a blank artist, or no year
- **THEN** it is rejected, naming each missing value, and nothing is saved

#### Scenario: A live album's recording year is its year
- **WHEN** a live album is saved with a recording year and no original release year
- **THEN** it is saved, and its original release year stays unknown

#### Scenario: A recording year doesn't stand in for a studio album's year
- **WHEN** an album that isn't live, or isn't known to be live, is saved with only a recording year
- **THEN** it is rejected for its missing original release year

#### Scenario: Edits can't clear a required value
- **WHEN** an owner edits an album to clear its artist, or its only year
- **THEN** the edit is rejected and the saved album keeps its values

### Requirement: Albums are identified, not editions
Tonaris SHALL keep one record per album, whichever edition its links point to, and SHALL NOT store edition details such as an edition label or a barcode (FR-02.12). The canonical metadata source's album identity, when known, SHALL be the album's identity.

#### Scenario: No edition details are stored
- **WHEN** an album is saved
- **THEN** its record holds no edition label and no barcode

### Requirement: List entry changes reach every session of the owner
Each added or removed list entry SHALL reach the owner's other open sessions through their change stream, and be in the data a new session loads (FR-09.1, TS-23, TS-24).

#### Scenario: Another session sees an album added and removed
- **WHEN** an owner adds an album to a list in one session, then removes it, while another session of theirs is open
- **THEN** the other session shows the album in the list, then out of it, without reloading

### Requirement: Owners edit an album's title, artist and year in its row
In Editing mode on desktop, an owner SHALL edit an album's title, artist and year inline in its row, starting with Enter or a double-click on the cell, or F2 for the title (FR-03.1, DS-45). The year SHALL be the one the cell shows: the original year, a live album's recording year or range, or the release year it falls back to. Offline, cells SHALL not open for editing (DS-81).

#### Scenario: Retitling an album
- **WHEN** an owner in Editing mode presses Enter on an album's title, types "Nightfall (Remastered)" and presses Enter
- **THEN** the row shows the new title, and it is saved

#### Scenario: A live album's recording range
- **WHEN** an owner edits the year of a live album recorded in 1978 and enters "1978–1982"
- **THEN** its year reads "rec. 1978–1982"

### Requirement: Inline album edits follow the album rules
An inline value FR-02.6 or the year's format refuses SHALL keep the editor open with the reason, and send nothing (X-05). Each saved edit SHALL be made from the value it replaces, so an edit of a value changed elsewhere is a conflict for review (FR-09.4).

#### Scenario: A refused year
- **WHEN** an owner enters "nineteen" as an album's year
- **THEN** the editor stays open with "Enter the year as four digits, such as 1986.", and nothing is sent
