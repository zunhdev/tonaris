# Spec Delta

## ADDED Requirements

### Requirement: The invitation landing shows its address
Opening an invitation's link SHALL show "You're invited to Tonaris" with the email address the invitation is bound to, before anything is sent (FR-11.2, DS-91). Continue SHALL send a code to that address only. An invitation that can't be used SHALL show one plain sentence for its status, and nothing else.

#### Scenario: A valid invitation
- **WHEN** someone opens an available invitation's link while admissions are open
- **THEN** the page says "You're invited to Tonaris" and shows the invited address, and no email has been sent yet

#### Scenario: An unusable invitation
- **WHEN** the link is unknown, or its invitation is revoked, expired or already used, or admissions are paused
- **THEN** the page shows only that status's sentence, such as "This invitation has been withdrawn."

### Requirement: Joining creates the account with an emailed code
The invited person SHALL join by entering the code emailed to the invitation's address, or by opening the email's link (FR-11.2, DS-91). Joining SHALL create their account and sign them in. In a browser other than the one that asked for the code, the link SHALL first ask "Join on this device?". Wrong, expired and used-up codes SHALL be explained as on sign-in. There SHALL be no country restriction or account cap.

#### Scenario: Joining with the code
- **WHEN** the invited person presses Continue and enters the emailed code
- **THEN** their account is created, they are signed in, and the invitation shows as redeemed

#### Scenario: The email's link elsewhere
- **WHEN** the code email's link opens in a browser that didn't ask for the code
- **THEN** the page asks "Join on this device?", and joins only when they choose Join

#### Scenario: A wrong code
- **WHEN** a wrong code is entered
- **THEN** the page says "That code isn't right. Check the email and try again.", and no account is created

### Requirement: An optional display name, then the first run
After joining, the page SHALL offer to add a display name, which can be skipped ("You can add this later") (FR-11.3). Either way, the person SHALL land on their empty collection's first-run state (DS-105). The display name SHALL never be taken from the email.

#### Scenario: Adding a name
- **WHEN** a new member enters "Anna" and saves
- **THEN** their account's display name is Anna, and they see their empty collection

#### Scenario: Skipping it
- **WHEN** a new member skips the name step
- **THEN** their account has no display name, and they see their empty collection

### Requirement: Returning members and sharing
A member who joined SHALL return by signing in, and reach the same account (FR-11.1, AC-01). A sharing invitation or guest link SHALL never create an account or admit anyone (FR-07.4, FR-11.2).

#### Scenario: Returning
- **WHEN** a new member signs out and signs in again with their address
- **THEN** they reach the same account, with the display name they chose

#### Scenario: Sharing doesn't admit
- **WHEN** a member shares with an address that has no account
- **THEN** no account is created, and that address can only sign in after the creator invites it
