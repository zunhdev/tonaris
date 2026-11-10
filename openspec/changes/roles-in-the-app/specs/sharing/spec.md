# Spec Delta

## ADDED Requirements

### Requirement: Owners pick roles in the sharing dialog
The sharing dialog SHALL let the owner pick a role when inviting, Can view unless chosen otherwise, and change each person's role in place, saved at once (FR-07.15, FR-07.18). A view invitation whose person already edits through a folder above SHALL say so.

#### Scenario: Inviting to edit
- **WHEN** the owner invites Anna to "Metal" with Can edit
- **THEN** Anna's row shows Can edit

#### Scenario: Changing a role
- **WHEN** the owner changes Anna's role on "Metal" to Can view
- **THEN** her row shows Can view, without a new invitation

#### Scenario: Editing through a folder
- **WHEN** Anna can edit "Metal" and is invited to view "Doom" inside it
- **THEN** her row in the dialog of "Doom" reads "Also editable through "Metal""

### Requirement: The person sees their role
An invitation to edit SHALL say so in its email, the inbox and its notice, and a share the person can edit SHALL be marked in Shared with me and the sidebar's tree (FR-07.18, DS-66, DS-67).

#### Scenario: The inbox
- **WHEN** Denis invites Anna to edit the folder "Metal"
- **THEN** her inbox lists it as "A folder from Denis, to edit", and the email says "Denis invited you to edit"

#### Scenario: Shared with me
- **WHEN** Anna accepted an invitation to edit "Metal"
- **THEN** Shared with me reads "Folder · by invitation · you can edit", and the tree marks "Metal"

## MODIFIED Requirements

### Requirement: Sharing is explained before it happens
The sharing dialog SHALL show, before any invitation or link (FR-07.14):
- that viewers see every custom field the albums use, including ones added later;
- for a folder, that everything inside it, now and in the future, is included;
- that people who can edit also change what's inside, and what they add stays in the owner's collection (FR-07.18);
- next to the link switch, that anyone with the link can view and forward it.

It SHALL list access inherited from folders above, read-only.

#### Scenario: A folder's disclosures
- **WHEN** the owner opens the dialog for the folder "Metal"
- **THEN** the field, descendant and editing disclosures show above Invite, and the link disclosure beside the switch

#### Scenario: Inherited access
- **WHEN** "Metal" has a link and the owner opens the dialog for "Doom" inside it
- **THEN** it says "Doom" is also visible through "Metal" by link
