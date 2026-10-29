# admission Specification

## Purpose
Who may hold a Tonaris account: accounts exist only through the creator's bootstrap or a creator's admission invitation, never through email verification alone (FR-11.2, FR-11.6; TS-71).

## Requirements

### Requirement: Sign-in never creates an account
Signing in SHALL only reach existing accounts; proving access to an email SHALL NOT create one (FR-11.2). For an address without an account, the page SHALL behave exactly as for an existing one, and the email SHALL explain that there is no Tonaris account for that address instead of carrying a code. The page SHALL NOT reveal whether an account exists (DS-90).

#### Scenario: An unknown address sees the same screen
- **WHEN** someone asks for a code for an address that has no account
- **THEN** they see the same "Check {email}" screen as everyone else, and the address receives an email saying it has no Tonaris account, with no code

#### Scenario: No code signs up an unknown address
- **WHEN** any code is submitted for an address that has no account
- **THEN** it is rejected like a wrong code, and no account is created

### Requirement: Creator bootstrap
A one-time command SHALL create the creator's account from the `CREATOR_EMAIL` setting with the `creator` role (TS-71). There SHALL be at most one creator, and no other way to grant the role. Running the command again for the same address SHALL change nothing. It SHALL refuse a different address once a creator exists, and an address that already belongs to another account.

#### Scenario: First deploy creates the creator
- **WHEN** the bootstrap runs with `CREATOR_EMAIL` set and no creator exists
- **THEN** an account for that address exists with the `creator` role and a verified email, and the creator can sign in with a code

#### Scenario: Running it again is harmless
- **WHEN** the bootstrap runs again with the same `CREATOR_EMAIL`
- **THEN** it reports that the creator exists and changes nothing

#### Scenario: A second creator is refused
- **WHEN** the bootstrap runs with a different address after a creator exists
- **THEN** it fails with an explanation and changes nothing

#### Scenario: The setting is missing
- **WHEN** the bootstrap runs without `CREATOR_EMAIL`, or with a value that is not an email address
- **THEN** it fails with an explanation and changes nothing

### Requirement: Admission administration is the creator's alone
Only the creator SHALL issue, inspect, resend and revoke admission invitations, and pause or resume admissions (FR-11.6). This SHALL happen in the app only, never through MCP (X-03). Other accounts SHALL NOT see the administration or reach it. Administration SHALL grant no access to other people's private collections.

#### Scenario: Another account is refused
- **WHEN** a signed-in account without the creator role opens Admin → Admissions or calls its API
- **THEN** the page is not found, the API answers `permission_denied`, and the account menu shows no Admin entry

#### Scenario: Signed out
- **WHEN** a signed-out visitor calls the administration API
- **THEN** it answers `unauthenticated`

#### Scenario: The creator sees Admin
- **WHEN** the creator opens the account menu
- **THEN** it has Admin, which opens Admin → Admissions

### Requirement: Issuing an invitation
The creator SHALL issue an invitation for one email address (FR-11.6). It SHALL be bound to that address, work once, and expire 14 days after it is issued, and it SHALL be emailed to that address at once. An address that already has an account, or already has an available invitation, SHALL be refused with an explanation. An address whose invitation expired SHALL be invited again.

#### Scenario: The creator invites someone
- **WHEN** the creator invites `anna@example.com`
- **THEN** the table shows her invitation as available, created now and expiring in 14 days, and she receives the invitation email with a link to her invitation page

#### Scenario: A member is refused
- **WHEN** the creator invites an address that already has an account
- **THEN** no invitation is created, and the explanation says the address already has an account

#### Scenario: An address already invited is refused
- **WHEN** the creator invites an address that has an available invitation
- **THEN** no second invitation is created, and the explanation points to that invitation

#### Scenario: An expired invitation's address is invited again
- **WHEN** the creator invites an address whose invitation has expired
- **THEN** the old invitation stays as expired, and a new available invitation is issued and emailed

### Requirement: Status and delivery are reported separately
Each invitation SHALL show its status (available, redeemed, revoked or expired) and, apart from it, how its email went: sending, sent, failed, or not confirmed (FR-11.6, FR-07.5). Created and expiry dates SHALL be shown. An available invitation past its expiry SHALL show as expired, and a daily job SHALL record it as such.

#### Scenario: Delivery follows the send
- **WHEN** an invitation's email is sent, or the provider refuses it, or the last try timed out
- **THEN** its delivery shows sent, failed, or not confirmed, and its status stays available

#### Scenario: A redeemed invitation
- **WHEN** the invited person joins with the invitation
- **THEN** its status shows redeemed

#### Scenario: Past its 14 days
- **WHEN** an available invitation is past its expiry
- **THEN** it shows as expired, can't be used to join, and is recorded as expired by the daily job

### Requirement: Resending an invitation
The creator SHALL resend an available invitation whose email failed or wasn't confirmed (FR-11.6). Resending SHALL email a new link and SHALL make the earlier link stop working. The invitation SHALL keep its address and expiry. An invitation that isn't available SHALL NOT be resent.

#### Scenario: A failed email is resent
- **WHEN** the creator resends an invitation whose email failed
- **THEN** the address receives a new invitation email, the delivery shows the new send's outcome, and the earlier link no longer works

#### Scenario: A revoked invitation isn't resent
- **WHEN** a resend is asked for an invitation that is revoked, redeemed or expired
- **THEN** it is refused with an explanation, and nothing is emailed

### Requirement: Revoking an invitation
The creator SHALL revoke an available invitation (FR-11.6). A revoked invitation SHALL NOT be redeemed. Revoking SHALL NOT delete or change an account that an invitation already admitted.

#### Scenario: A revoked invitation can't be used
- **WHEN** the creator revokes an available invitation and the invited person then tries to join with it
- **THEN** the invitation shows revoked, and joining is refused as withdrawn

#### Scenario: Admitted accounts are kept
- **WHEN** the creator tries to revoke an invitation that was already redeemed
- **THEN** it is refused with an explanation, and the account it admitted keeps its access

### Requirement: Pausing and resuming admissions
The creator SHALL pause and resume admissions with a switch labelled "Accepting new members" (FR-11.6, FR-11.2). While admissions are paused, no account SHALL be created. Pausing SHALL keep existing members' access, and SHALL neither redeem nor revoke outstanding invitations. Resuming SHALL make outstanding invitations work again.

#### Scenario: Pausing
- **WHEN** the creator turns "Accepting new members" off
- **THEN** the page notes that existing members keep access and outstanding invitations stay as they are, invited people can't join, and members still sign in

#### Scenario: Resuming
- **WHEN** the creator turns it back on
- **THEN** an invitation issued before the pause, still available, works again

### Requirement: An invitation admits only its address, once
An invitation SHALL create at most one account, for its own address only (FR-11.6, FR-13.5). A forwarded invitation SHALL NOT enroll another address. A retried or concurrent registration SHALL NOT duplicate an account or consume an invitation without creating its account.

#### Scenario: A forwarded invitation
- **WHEN** someone other than the invited person opens a forwarded invitation and asks for a code
- **THEN** the code goes only to the invited address, so no other address can register with it

#### Scenario: A retried registration
- **WHEN** the same registration is sent twice, or two arrive at once
- **THEN** one account exists, the invitation shows redeemed, and the retry signs in or is refused without creating another

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
