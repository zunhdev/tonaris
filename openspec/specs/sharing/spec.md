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

### Requirement: Owners share folders and lists by invitation and link
An owner SHALL share a folder or list read-only by inviting an existing account by email, by turning on a link, or both (FR-07.1). The collection's top is not shareable. Sharing SHALL be done in the app only (X-03).

#### Scenario: Inviting a member
- **WHEN** the owner invites "anna@example.com", which belongs to an account, to the list "Doom"
- **THEN** Anna's invitation shows as Pending in the dialog

#### Scenario: Turning on a link
- **WHEN** the owner turns on link sharing for "Doom"
- **THEN** the dialog shows the link with Copy, and the same link each time it opens

#### Scenario: Not through MCP
- **WHEN** an MCP connection tries to invite someone
- **THEN** it is refused as app-only

### Requirement: Invitations need an existing account
Inviting an address with no account SHALL be refused, creating no account, admission or invitation (FR-07.4, X-05). The refusal SHALL keep the typed address and suggest a link instead. Inviting the same person again SHALL never duplicate their invitation (FR-07.5).

#### Scenario: Not a member
- **WHEN** the owner invites "nobody@example.com"
- **THEN** "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead." shows, and the address stays in the field

#### Scenario: Invited twice
- **WHEN** the owner invites Anna to "Doom" twice
- **THEN** one invitation exists

### Requirement: Sharing is explained before it happens
The sharing dialog SHALL show, before any invitation or link (FR-07.14):
- that viewers see every custom field the albums use, including ones added later;
- for a folder, that everything inside it, now and in the future, is included;
- next to the link switch, that anyone with the link can view and forward it.

It SHALL list access inherited from folders above, read-only.

#### Scenario: A folder's disclosures
- **WHEN** the owner opens the dialog for the folder "Metal"
- **THEN** the field and descendant disclosures show above Invite, and the link disclosure beside the switch

#### Scenario: Inherited access
- **WHEN** "Metal" has a link and the owner opens the dialog for "Doom" inside it
- **THEN** it says "Doom" is also visible through "Metal" by link

### Requirement: Sharing needs a display name
Inviting and turning on a link SHALL require a non-blank display name (FR-11.3, TS-34). Without one, the dialog SHALL offer to add it in place. Clearing the display name SHALL be refused while any invitation is pending or accepted or any link is on (AC-38).

#### Scenario: No display name yet
- **WHEN** an owner without a display name opens the dialog
- **THEN** "Add a display name to share" replaces Invite and the link switch

#### Scenario: Clearing while sharing
- **WHEN** an owner with a link on clears their display name
- **THEN** it is refused, and the name stays
