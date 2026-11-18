## ADDED Requirements

### Requirement: People choose their avatar's color
Settings → Profile SHALL offer the avatar's color: Automatic, the color from the name, or one of 12 fixed hues, each keeping the white letter at 4.5:1 (FR-11.16, DS-93). A choice SHALL save at once, in the app only (X-03), and every avatar of the person SHALL show it.

#### Scenario: Picking blue
- **WHEN** Denis picks Blue in Settings → Profile
- **THEN** his account menu's avatar turns blue, and so does his avatar in Anna's sharing dialog

### Requirement: People write an About text
Settings → Profile SHALL take an About text: plain text, at most 160 characters, saved when the field is left or on Enter, and cleared when blank (FR-11.16). It SHALL be app-only (X-03), and neither exports nor MCP SHALL carry it (FR-08.4).

#### Scenario: Too long
- **WHEN** Denis types a 161st character
- **THEN** the field keeps 160

### Requirement: Only your people see your About
A person's About SHALL show only to their people (FR-07.23) from their side: those they invited, unless only declined, and those whose invitations they accepted, unless removed from People. It SHALL show on the person's page in People and in a card from the "Shared by" pill (DS-121, DS-70). Guests and anyone else SHALL see the name and avatar only.

#### Scenario: An invitation not yet answered
- **WHEN** Ben invites Denis and Denis hasn't answered
- **THEN** Ben doesn't see Denis's About

#### Scenario: The Shared by card
- **WHEN** Denis, who accepted Anna's invitation to "Jazz", opens the "Shared by Anna" pill
- **THEN** a card shows Anna's avatar, name and About

### Requirement: Owners' avatars show beside their names
The owner's avatar, in their color, SHALL show beside their name in Shared with me, the Invitations inbox and its notices, the "Shared by" pill, and guest pages (FR-07.3, FR-11.16).

#### Scenario: A guest page
- **WHEN** a guest opens Anna's link to "Jazz"
- **THEN** the page shows Anna's avatar in her color, and not her About
