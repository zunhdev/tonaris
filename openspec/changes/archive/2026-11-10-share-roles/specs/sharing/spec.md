# Spec Delta

## ADDED Requirements

### Requirement: Invitations carry a role
Each invitation SHALL carry a role, view or edit, chosen by the owner when inviting, view unless chosen otherwise (FR-07.18). Inviting someone who already has an open invitation SHALL keep it and its role. Links SHALL only ever give view.

#### Scenario: Inviting to edit
- **WHEN** the owner invites Anna to the list "Doom" with the role edit
- **THEN** Anna's pending invitation to "Doom" has the role edit

#### Scenario: The default
- **WHEN** the owner invites Ben to "Doom" without a role
- **THEN** Ben's invitation has the role view

### Requirement: Owners change roles
An owner SHALL be able to change the role of a pending or accepted invitation, in the app only (FR-07.15, FR-07.18, X-03). The person SHALL NOT accept again, and their access SHALL follow the new role from their next read or change. An ended invitation's role SHALL NOT change.

#### Scenario: Raised without a new acceptance
- **WHEN** Anna accepted an invitation to view "Doom", and the owner changes it to edit
- **THEN** Anna can edit "Doom" without accepting again

#### Scenario: Not through MCP
- **WHEN** an MCP connection tries to change a role
- **THEN** it is refused as app-only, and the role is unchanged

### Requirement: The highest role through folders applies
A person's role on a folder or list SHALL be the highest among their accepted invitations to it and to its active folders above (FR-07.18). Pending, declined, withdrawn and revoked invitations SHALL give none. Trash SHALL suspend a role as it suspends access, and recovery SHALL resume it.

#### Scenario: Edit through a folder
- **WHEN** Anna accepted an invitation to edit "Metal" and one to view "Doom" inside it
- **THEN** Anna's role on "Doom" is edit

#### Scenario: A link reads only
- **WHEN** Anna can read "Doom" only through a link she saved
- **THEN** her role on "Doom" is view

#### Scenario: Suspended by Trash
- **WHEN** the owner moves "Metal", which Anna can edit, to Trash and recovers it
- **THEN** Anna has no role inside "Metal" while it is in Trash, and edit again after recovery

### Requirement: Reads say the role
The owner's sharing settings SHALL give each invitation's role, and the nearest folder above through which that person can edit, if any (FR-07.18, DS-65). The recipient's invitations and Shared with me SHALL give the role. A shared folder or list SHALL say its reader's role.

#### Scenario: The owner's dialog
- **WHEN** Anna can edit "Metal" and is invited to view "Doom" inside it
- **THEN** the settings of "Doom" list Anna's invitation as view, editable through "Metal"

#### Scenario: Shared with me
- **WHEN** Anna accepted an invitation to edit "Doom"
- **THEN** her Shared with me gives "Doom" the role edit

### Requirement: Editors see all the owner's fields
A person who can edit a shared folder or list SHALL see all the owner's custom fields with all their options, used or not, so they can set them (FR-07.12, FR-07.20). Viewers SHALL still see only the fields the albums use, with only the options they choose.

#### Scenario: An unused field
- **WHEN** the owner has the field "Rating", which no shared album uses, and Anna can edit the share
- **THEN** Anna sees "Rating" with all its options, and Ben, who can view it, doesn't

### Requirement: A lowered role stays lowered after a restore
Lowering an invitation's role from edit to view SHALL be recorded in the revocation ledger, and a restore SHALL replay it, so a restored backup never brings edit rights back (FR-07.18, Q-04).

#### Scenario: Restored from before the change
- **WHEN** the owner lowers Anna's role on "Doom" to view, and the database is restored from a backup made before
- **THEN** after the ledger is replayed, Anna's role on "Doom" is view

## MODIFIED Requirements

### Requirement: Owners share folders and lists by invitation and link
An owner SHALL share a folder or list by inviting an existing account by email, to view or to edit (FR-07.18), by turning on a link, which only gives view, or both (FR-07.1). The collection's top is not shareable. Sharing SHALL be done in the app only (X-03).

#### Scenario: Inviting a member
- **WHEN** the owner invites "anna@example.com", which belongs to an account, to the list "Doom"
- **THEN** Anna's invitation shows as Pending in the dialog

#### Scenario: Turning on a link
- **WHEN** the owner turns on link sharing for "Doom"
- **THEN** the dialog shows the link with Copy, and the same link each time it opens

#### Scenario: Not through MCP
- **WHEN** an MCP connection tries to invite someone
- **THEN** it is refused as app-only

### Requirement: Only the intended recipient accepts or declines
Pending and declined invitations SHALL grant nothing (FR-07.6). The signed-in recipient SHALL accept or decline in the app. Accepting SHALL grant the invitation's role on the shared folder or list and its descendants (FR-07.18), and save it to the recipient's references, reusing an existing one; nothing is copied and no slots are used. Declining SHALL revoke no access from other grants or links. An invitation no longer valid SHALL grant nothing, and opening it SHALL say it is unavailable.

#### Scenario: Accepting
- **WHEN** Anna accepts her invitation to the folder "Metal"
- **THEN** she may read "Metal" and its lists, and it is in her references

#### Scenario: Someone else
- **WHEN** Ben opens Anna's invitation link while signed in as himself
- **THEN** he reads "This invitation is for a different account — sign out and sign in with that email", and nothing about the folder

#### Scenario: No longer available
- **WHEN** Anna opens an invitation she already declined
- **THEN** she reads "This invitation is no longer available"
