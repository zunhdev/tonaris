# Spec Delta

## ADDED Requirements

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
