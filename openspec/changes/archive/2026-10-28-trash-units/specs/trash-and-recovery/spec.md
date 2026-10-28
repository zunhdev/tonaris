## Purpose

Deleted folders, lists and albums wait in Trash for 30 days, in units recovered and purged as a whole, so nothing is lost by accident (FR-01.11 to FR-01.18, FR-14).

## ADDED Requirements

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
