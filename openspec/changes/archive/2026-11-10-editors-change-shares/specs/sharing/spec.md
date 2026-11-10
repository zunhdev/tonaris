# Spec Delta

## ADDED Requirements

### Requirement: Editors change folders and lists inside a share
Inside a folder or list they can edit, an editor SHALL create, rename, describe, color, move and delete folders and lists under the owner's rules, in the owner's collection, counting toward the owner's limits (FR-07.19). Something new at their own top level SHALL be theirs.

#### Scenario: A new list in the share
- **WHEN** Anna, who can edit "Metal", creates the list "Sludge" in it
- **THEN** "Sludge" is in Denis's collection, inside "Metal"

#### Scenario: Deleted to the owner's Trash
- **WHEN** Anna deletes the list "Doom" inside "Metal"
- **THEN** "Doom" is in Denis's Trash

### Requirement: The shared folder or list stays where its owner put it
An editor SHALL rename, describe and color the folder or list shared with them, and SHALL NOT move or delete it (FR-07.20).

#### Scenario: Renaming the share
- **WHEN** Anna renames "Metal", which she can edit, to "Heavy"
- **THEN** it is renamed for Denis and everyone it is shared with

#### Scenario: Deleting the share
- **WHEN** Anna tries to delete "Metal"
- **THEN** it is refused, and "Metal" stays

### Requirement: Editors move things only inside one share
An editor's move SHALL stay inside one share: never out of it, to the top level, into a folder they can't edit, or into another share (FR-07.20). The owner's depth and name rules SHALL still apply.

#### Scenario: Inside the share
- **WHEN** Anna moves "Doom" from "Metal" into "Funeral", also inside "Metal"
- **THEN** it moves

#### Scenario: Out of the share
- **WHEN** Anna tries to move "Doom" into Denis's unshared "Private", or into "Jazz", which she can also edit
- **THEN** it is refused, and "Doom" stays

### Requirement: Editors change albums in the share
An editor SHALL change an album's details, links, artwork and field values through a list they can edit that holds it, and the change SHALL show wherever the album appears (FR-07.19, FR-07.21). They SHALL NOT create, rename, retype or delete fields or options (FR-07.20).

#### Scenario: An album in the share
- **WHEN** Anna corrects the title of "Bleach", which is in "Doom" and in Denis's private "Secret"
- **THEN** the new title shows in both lists

#### Scenario: An album only in private lists
- **WHEN** Anna tries to change "Hidden", which is only in "Secret"
- **THEN** it is answered as not found

### Requirement: Editors add albums they see, and new ones
An editor SHALL add to a list they can edit an album they already see, a new album, or one captured from a link, in the owner's collection (FR-07.19). Adding SHALL NOT reach an album of the owner's they don't see, and a capture reusing one SHALL read as newly added (FR-07.21).

#### Scenario: A captured album the owner had
- **WHEN** Anna captures a link to "Bleach" into "Doom", and Denis has "Bleach" in no list she sees
- **THEN** Denis's "Bleach" is in "Doom", and Anna is told it was added

#### Scenario: An album by its ID
- **WHEN** Anna asks to add "Hidden", which she doesn't see, to "Doom"
- **THEN** it is answered as not found

### Requirement: An editor's album deletion leaves the share only
An editor's deletion of an album SHALL take it out of the lists they edit (FR-07.21). The owner's other lists SHALL keep it; with none, it SHALL go to the owner's Trash. The editor's outcome SHALL be the same either way.

#### Scenario: Kept in a private list
- **WHEN** Anna deletes "Bleach", which is in "Doom" and in Denis's "Secret"
- **THEN** it leaves "Doom", stays in "Secret", and is not in Trash

#### Scenario: Only in the share
- **WHEN** Anna deletes "Nightfall", which is only in "Doom"
- **THEN** it is in Denis's Trash

### Requirement: Editors undo their own deletions only
An editor SHALL restore a folder or list they deleted, in the app, back where it was while they can still edit there (FR-07.20). Everything else in the owner's Trash, and emptying it, SHALL stay the owner's.

#### Scenario: Undo
- **WHEN** Anna deletes "Doom" and chooses Undo
- **THEN** "Doom" is back in "Metal"

#### Scenario: The owner's deletion
- **WHEN** Denis deletes "Deep" and Anna asks to recover it
- **THEN** it is answered as not found, and stays in Trash

### Requirement: Refusals reveal nothing outside a share
A person who can only read a folder, list or album SHALL be told they can view it but not change it. Anyone else's change to content they can't read SHALL be answered as for content that doesn't exist (FR-07.20).

#### Scenario: A viewer
- **WHEN** Ben, who can view "Metal", tries to rename "Doom"
- **THEN** he is told he can view it but not change it

#### Scenario: A stranger
- **WHEN** Cleo, who has no access, tries to rename "Doom"
- **THEN** she is told it doesn't exist

### Requirement: An editor's changes are the owner's
An editor's change SHALL be saved in the owner's collection and reach the owner's devices and the share's viewers live (FR-07.19, X-08). Its retries and the hourly limit on link captures SHALL be the editor's. A lowered role or revoked invitation SHALL refuse their next change.

#### Scenario: Live to the owner
- **WHEN** Anna renames "Doom" while Denis has the app open
- **THEN** Denis's "Doom" shows the new name without reloading

#### Scenario: Role lowered
- **WHEN** Denis lowers Anna's role on "Metal" to view, and Anna renames "Doom"
- **THEN** she is told she can view it but not change it

### Requirement: Editors' agents edit as they do
An editor's Manage collection connection SHALL change a share as the editor can, and a Read-only one SHALL NOT (FR-10.3, FR-10.4).

#### Scenario: A Read-only connection
- **WHEN** Anna's Read-only connection tries to rename "Doom"
- **THEN** it is refused, and "Doom" keeps its name
