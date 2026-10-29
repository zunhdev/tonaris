# trash-and-recovery Specification

## Purpose

Deleted folders, lists and albums wait in Trash for 30 days, in units recovered and purged as a whole, so nothing is lost by accident (FR-01.11 to FR-01.18, FR-14).

## Requirements

### Requirement: Deleting a folder or list moves it to Trash
Deleting a list or folder SHALL move it to Trash (FR-01.11). A folder SHALL take its active nested folders and lists with it. Trashed folders and lists SHALL leave active views at once. Their memberships SHALL be kept for recovery, but an album in no other active list SHALL be in Unsorted, at its top (DS-51).

#### Scenario: A list leaves its albums in Unsorted
- **WHEN** the owner deletes the list "Doom", whose album "Dopesmoker" is in no other list
- **THEN** "Doom" leaves the sidebar, and "Dopesmoker" is at the top of Unsorted

### Requirement: A deleted list can be undone, and a folder is confirmed first
A deleted list SHALL be undoable from its notice (DS-50). Deleting a folder SHALL be confirmed (X-07), naming the folder and the hierarchy going to Trash and saying that albums stay in other lists or Unsorted.

#### Scenario: A list
- **WHEN** the owner deletes the list "Doom", whose album "Dopesmoker" is in no other list
- **THEN** "1 list moved to Trash" offers Undo

#### Scenario: Undone
- **WHEN** the owner deletes "Doom" and chooses Undo
- **THEN** "Doom" is back where it was, with "Dopesmoker" in it

#### Scenario: A folder, confirmed
- **WHEN** the owner deletes the folder "Metal", holding "Doom" and "Sludge"
- **THEN** a confirmation names "Metal" and its 2 lists, and nothing moves to Trash until the owner confirms

### Requirement: Content deleted together is one unit
A folder and the active descendants deleted with it SHALL form one Trash unit, with one deletion time and one expiry 30 days later (FR-01.13, FR-01.17). A folder, list or album deleted separately SHALL be its own unit, even if its parent is deleted later. Deleting, recovering or purging a parent SHALL never absorb, restore, remove or re-date a separately deleted unit.

#### Scenario: Deleted together
- **WHEN** the owner deletes the folder "Metal" holding the list "Doom"
- **THEN** one unit holds both, with one deletion time and one expiry

#### Scenario: Deleted separately
- **WHEN** the owner deletes the list "Doom", and later its folder "Metal"
- **THEN** "Doom" keeps its own unit and expiry, and recovering "Metal" leaves "Doom" in Trash

### Requirement: Recovery returns a unit to its parent
Recovering a unit SHALL return its folders and lists, active again with their effective memberships for active albums (FR-01.14). It SHALL go to the root's original parent if that parent is active (FR-01.15).

#### Scenario: Recovered
- **WHEN** the owner recovers the list "Doom" from Trash, its folder still active
- **THEN** "Doom" is back in its folder, with its active albums in it

### Requirement: Recovery asks for a destination or name when it must
If the original parent is missing or in Trash, the owner SHALL choose an active folder or the root before anything changes (FR-01.15). A name taken among the new siblings SHALL make the owner choose another name or destination, with nothing renamed or merged automatically (FR-01.16). Until then, the unit SHALL stay in Trash with its expiry running.

#### Scenario: The parent is in Trash
- **WHEN** the owner recovers "Doom", whose folder "Metal" is in Trash
- **THEN** recovery asks for a destination, and "Doom" stays in Trash until one is given

#### Scenario: The name is taken
- **WHEN** the owner recovers "Doom" into the root, which has another "Doom"
- **THEN** recovery asks for another name or destination, and nothing changes until one is given

### Requirement: Recovery reports what it skipped
Recovering a folder or list SHALL restore entries only for albums that are active, keeping their current data (FR-01.14). Each entry it skips SHALL be reported with its reason: the album is in Trash, or it was deleted permanently. Everything else SHALL be recovered.

#### Scenario: An album in Trash
- **WHEN** the owner recovers "Doom", one of whose albums is in Trash
- **THEN** "Doom" is back with its other albums, and the notice says one membership was skipped, its Details naming the album and that it is in Trash

### Requirement: Recovery prompts change nothing until answered
When recovery needs a destination or a name, the owner SHALL be asked (DS-56): for a destination, among the collection and the active folders; for a name, with the current one selected for editing and a way to choose another place instead. Cancelling SHALL leave the unit in Trash with its expiry running. A name still taken SHALL be refused with its reason, and nothing SHALL be renamed automatically.

#### Scenario: Cancelled
- **WHEN** recovery asks where to restore "Doom", and the owner cancels
- **THEN** "Doom" stays in Trash, its expiry unchanged

#### Scenario: A destination chosen
- **WHEN** recovery asks where to restore "Sludge", whose folder is in Trash, and the owner chooses the collection
- **THEN** "Sludge" is restored at the top level

#### Scenario: Another name
- **WHEN** recovery asks for another name for "Doom", and the owner enters "Doom (old)"
- **THEN** the list is restored as "Doom (old)", next to the other "Doom"

### Requirement: Deleting an album from the collection is confirmed
Deleting an album from the collection SHALL be confirmed, explaining that it leaves every list and Unsorted and goes to Trash for 30 days (FR-14.1). It SHALL be its own unit. Its information, links, field values and former entries SHALL be kept while it is in Trash, and it SHALL leave active views at once.

#### Scenario: Confirmed
- **WHEN** the owner deletes "Dopesmoker", in "Doom", and confirms
- **THEN** it leaves "Doom" and Unsorted, and is in Trash as its own unit

### Requirement: A restored album returns to its active lists
Restoring an album SHALL bring back its entries in still-active lists (FR-14.2). Entries in lists in Trash SHALL be reported as skipped with their reason, and lists and folders SHALL NOT be restored. With no entry to bring back, the album SHALL enter Unsorted.

#### Scenario: A list in Trash meanwhile
- **WHEN** "Dopesmoker" was in "Doom" and "Later", "Later" went to Trash, and the owner restores "Dopesmoker"
- **THEN** it is back in "Doom", and "Later" is reported as skipped because it is in Trash

### Requirement: Restoring a second record of the same album pauses
If restoring would make a second active record confidently identified as the same album, the restore SHALL pause, naming the active record, and nothing SHALL change: both records and their entries stay, and the original stays in Trash with its expiry (FR-14.3). The owner SHALL keep the active record, or delete it into Trash, confirmed, and restore.

#### Scenario: Captured again meanwhile
- **WHEN** "Dopesmoker" is in Trash, the owner captured it again as a new record, and then restores the first
- **THEN** the restore pauses, showing both, and neither changes until the owner chooses

### Requirement: Trash expires after 30 days
Units SHALL be removed for good once 30 days have passed since their deletion, with their recovery information (FR-01.17). A container's removal SHALL remove only its organization: its albums stay in their other lists or Unsorted. Albums SHALL expire individually (FR-14.5).

#### Scenario: Expired
- **WHEN** a list's unit is 30 days old at the hourly check
- **THEN** the list and its entries are gone, its albums stay in their other lists or Unsorted, and the owner's sessions see the unit leave Trash

### Requirement: Early permanent removal is confirmed and app-only
The owner SHALL be able to remove units for good before they expire, or empty Trash, only in the app and after confirming (FR-01.18, X-03). Units already gone SHALL be reported, and the rest still removed. A purged album SHALL free its slot.

#### Scenario: Through MCP
- **WHEN** an MCP connection in Manage mode asks to purge a unit
- **THEN** it is refused as app-only, and the unit stays

### Requirement: Purged content is reported by later recoveries
Purging an album SHALL leave a tombstone in every unit still referring to it, and purging a list SHALL leave one in the unit of any album in Trash that was in it. A later recovery SHALL report those entries as skipped, never recreating them (TS-13).

#### Scenario: A list purged while its album is in Trash
- **WHEN** "Dopesmoker" is in Trash, its list "Doom" is purged, and the owner restores "Dopesmoker"
- **THEN** the restore reports that "Doom" was deleted permanently

### Requirement: Trash shows units with their expiry and former place
Trash SHALL list the owner's units, each with its name, what it holds, when it was deleted, when it expires, and where it was (DS-55). The expiry SHALL read in words with the exact date on hover or focus, and warn under 3 days. A local filter SHALL narrow the units by name.

#### Scenario: A deleted folder
- **WHEN** the owner opens Trash after deleting the folder "Metal" with two lists
- **THEN** its row reads "Folder · 2 lists", "Expires in 30 days", and "Collection" as where it was

### Requirement: A folder's contents are read-only in Trash
A folder unit SHALL open to show its folders and lists, explaining that they are part of the folder and are acted on by restoring or deleting the folder (FR-01.13). They SHALL have no actions of their own.

#### Scenario: Opened
- **WHEN** the owner opens "Metal" in Trash
- **THEN** "Doom" and "Sludge" show under "Part of 'Metal' — restore or delete the folder to act on these.", with no buttons

### Requirement: Trash is operable by keyboard
Every action in Trash SHALL work by keyboard: opening a folder's contents, Restore, also as R on the focused row, Delete permanently…, Empty Trash…, and the filter. Deleting permanently and emptying Trash SHALL be confirmed, naming the count, and stating that they can't be undone (DS-57).

#### Scenario: R
- **WHEN** focus is on a unit's row and the owner presses R
- **THEN** the unit is restored, asking where or as what only when it must

### Requirement: Recovery refuses an expired unit
Recovering a unit at or past its expiry SHALL be refused as expired, even before the hourly purge removes it, in the app and through MCP alike (FR-01.17, X-02). Nothing SHALL come back.

#### Scenario: Minutes after expiry
- **WHEN** a person recovers a list whose 30 days ended before the purge ran
- **THEN** the recovery fails as expired, and the list stays in Trash until the purge removes it
