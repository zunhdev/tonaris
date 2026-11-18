## ADDED Requirements

### Requirement: Your people come from invitations
A person's people SHALL be everyone they invited to a folder or list, unless that person only ever declined, and everyone who invited them, once they accepted, even after leaving or a revocation (FR-07.23). Accounts being deleted SHALL never be anyone's people, and nobody else SHALL be findable.

#### Scenario: A declined invitation
- **WHEN** Denis invites Anna to "Doom" and she declines
- **THEN** Anna isn't one of Denis's people

#### Scenario: A revoked share
- **WHEN** Denis invites Anna to "Doom", she accepts, and Denis revokes it
- **THEN** Anna is still one of Denis's people, and Denis one of hers

#### Scenario: A pending invitation to you
- **WHEN** Anna invites Denis to "Jazz" and he hasn't answered
- **THEN** Anna isn't one of Denis's people yet

### Requirement: The invite field suggests your people
The sharing dialog's invite field SHALL suggest the owner's people (FR-07.23, DS-65): before typing, the 8 most recently shared with in either direction; while typing, those whose display name or typed address matches, ignoring case and accents (FR-12.5). People with a pending or accepted invitation to this folder or list SHALL NOT be offered. ↑, ↓ and Enter SHALL pick one.

#### Scenario: Before typing
- **WHEN** Denis, who has shared with ten people, focuses the invite field
- **THEN** the 8 he shared with most recently are suggested, the latest first

#### Scenario: Typing a name
- **WHEN** Denis types "ann" in the invite field
- **THEN** Anna is suggested, with the address he typed for her

#### Scenario: Already invited here
- **WHEN** Anna has a pending invitation to "Doom"
- **THEN** "Doom"'s invite field doesn't suggest her

### Requirement: Someone who invited you keeps their email hidden
A suggested person who invited the owner, and whom the owner never invited by address, SHALL show by display name only, never their email (FR-07.3). When two suggestions show the same name, each SHALL name one of their shares the owner can open, as "shares "Doom" with you".

#### Scenario: Two Annas
- **WHEN** two people named Anna invited Denis, to "Doom" and to "Jazz"
- **THEN** the suggestions read "Anna · shares "Doom" with you" and "Anna · shares "Jazz" with you"

### Requirement: Owners invite one of their people by account
Choosing a suggestion SHALL invite that person's account with the role chosen, with no address typed (FR-07.4, FR-07.23). The invitation SHALL keep the address the owner last typed for them, if any. An id that isn't one of the owner's people SHALL be refused exactly as an address with no account is, so ids can't be probed.

#### Scenario: Sharing back
- **WHEN** Anna invited Denis to "Jazz", he accepted, and he chooses Anna in "Doom"'s invite field
- **THEN** Anna has a pending invitation to "Doom", emailed to her, and Denis's dialog shows her name without an address

#### Scenario: A stranger's id
- **WHEN** Denis invites by the id of an account he has no invitation with
- **THEN** it's refused with `recipient_not_found`, as an unregistered address is
