## ADDED Requirements

### Requirement: People lists everyone you share with
A People item in the sidebar, after Shared with me, and a People row on a phone's Shared screen SHALL open `/people` (FR-07.24, DS-121): a row per person (FR-07.23), the most recently shared with first, with their avatar, display name, the address the owner typed if any, what the owner shares with them, counted by kind with those to edit, and what they share with the owner that opens. A field SHALL find people by name or address (FR-12.5).

#### Scenario: Both ways
- **WHEN** Denis shares "Doom" and "Metal" with Anna, "Metal" to edit, and Anna shares "Jazz" with him
- **THEN** Anna's row reads "You share 1 list and 1 folder (1 to edit)" and "Shares 1 list with you"

#### Scenario: Finding a person
- **WHEN** Denis types "ann" in the field
- **THEN** only Anna's row shows

### Requirement: A person's page shows what's shared each way
`/people/{id}` SHALL list each of the owner's folders and lists outside Trash with an invitation to that person, with its role and Pending or Accepted, and each of theirs the owner can open or has a pending invitation to (FR-07.24). The owner's SHALL open their sharing dialog on a desktop, theirs the shared view or the pending invitation. A folder SHALL say that everything inside it is included (FR-07.8). Anyone who isn't one of the owner's people SHALL be not found.

#### Scenario: Opening one of theirs
- **WHEN** Denis opens Anna's page and chooses "Jazz"
- **THEN** "Jazz" opens in the shared view

#### Scenario: Not one of your people
- **WHEN** Denis opens the page of someone he has no invitation with
- **THEN** it says the person isn't one of his people

### Requirement: Owners stop sharing with a person at once
"Stop sharing with {name}…" SHALL revoke every pending or accepted invitation of the owner's to that person, Trash included, after the standard confirmation listing what they lose (FR-07.15, FR-07.24, X-07). Their shares with the owner SHALL be unaffected, and they SHALL stay one of the owner's people. It SHALL be app-only (X-03) and desktop-only.

#### Scenario: Stop sharing with Anna
- **WHEN** Denis confirms "Stop sharing with Anna"
- **THEN** Anna's invitations to "Doom" and "Metal" are revoked, and "Jazz" stays in Denis's Shared with me

### Requirement: Owners remove someone from People
"Remove from People" SHALL hide a person from the People page and the invite suggestions, revoking nothing, until a later invitation either way connects them again (FR-07.23, FR-07.24). It SHALL be app-only and desktop-only, and inviting a hidden person by id SHALL be refused as a stranger's id is.

#### Scenario: Removed, then invited again
- **WHEN** Denis removes Anna from People and later invites her by address
- **THEN** Anna is back on his People page
