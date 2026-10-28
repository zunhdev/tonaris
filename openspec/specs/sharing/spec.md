# sharing Specification

## Purpose

Read-only sharing of folders and lists: who may read shared content, by accepted invitation grants and by links, through the folder hierarchy and Trash, and what they see of it (FR-07).

## Requirements

### Requirement: Folder shares include current and future descendants
Access through a grant or a link on a folder SHALL extend to every active descendant, including ones created later (FR-07.8). New content outside any shared folder SHALL be readable by nobody but its owner (FR-07.2).

#### Scenario: A new list inside a shared folder
- **WHEN** the owner creates the list "Doom" inside the folder "Metal", which Anna has accepted
- **THEN** Anna may read "Doom"

#### Scenario: A new list at the top
- **WHEN** the owner creates the list "Private" at the top of the collection
- **THEN** no viewer may read it

### Requirement: Inherited access follows moves
Moving content into a shared folder SHALL give it that folder's audience, and moving it out SHALL remove access inherited only from folders that no longer contain it (FR-07.9). Direct shares on the moved content or its descendants SHALL remain.

#### Scenario: Moved out
- **WHEN** the owner moves the list "Doom" out of the shared folder "Metal" to the top
- **THEN** Metal's viewers may no longer read "Doom"

#### Scenario: A direct share stays
- **WHEN** "Doom" also has its own link, and it is moved out of "Metal"
- **THEN** the link still opens "Doom"

### Requirement: Only accepted grants and active links give access
A grant SHALL give access only while it is accepted; pending, declined, withdrawn and revoked grants SHALL give none (FR-07.6). A link SHALL give access only while it is not revoked (FR-07.16). Link tokens SHALL be 256-bit random secrets, stored only as hashes (TS-32).

#### Scenario: Pending
- **WHEN** Anna's invitation to "Metal" is still pending
- **THEN** Anna may not read "Metal"

#### Scenario: Revoked link
- **WHEN** the owner disables the link of "Metal"
- **THEN** its old token no longer opens anything

### Requirement: Trash suspends sharing and recovery resumes it
Content in Trash SHALL be readable through no sharing path, while its grants and links are kept (FR-07.10). Recovery SHALL resume links not revoked and grants still accepted. Pending invitations SHALL stay pending, and revocations made meanwhile SHALL stay in effect.

#### Scenario: Suspended and resumed
- **WHEN** the owner moves the shared folder "Metal" to Trash and recovers it
- **THEN** its viewers can't read it while it is in Trash, and can again after recovery

#### Scenario: Revoked meanwhile
- **WHEN** the owner disables Metal's link while "Metal" is in Trash, then recovers it
- **THEN** the link still opens nothing

### Requirement: Viewers see live content and only the fields it uses
A viewer of a shared container SHALL see its current active subtree, with descriptions, the active albums in its lists with their standard information and links, and the owner's display name (FR-07.11, FR-07.3). They SHALL see every custom field those albums use, with its values, and no unused field or option (FR-07.12). Albums outside the scope and private ancestors SHALL NOT be revealed.

#### Scenario: Used fields only
- **WHEN** the owner has the fields "Mood" and "Rating", and only "Mood" is applied to an album in the shared list
- **THEN** the viewer sees "Mood" with its value, and not "Rating"

#### Scenario: Albums outside the scope
- **WHEN** the shared list "Doom" holds "Nightfall", and "Bleach" is only in an unshared list
- **THEN** the viewer sees "Nightfall" and not "Bleach"
