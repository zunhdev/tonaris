# Spec Delta

## ADDED Requirements

### Requirement: A help page explains recovery
`/help/recovery` SHALL explain that the creator can move an account to a new address once they are satisfied it is the person's, and show the support address from the `SUPPORT_EMAIL` setting (FR-11.5, DS-93). There SHALL be no in-app request form. Sign-in and Settings → Account SHALL link to it as "Lost access to your email?".

#### Scenario: Opening it from sign-in
- **WHEN** someone signed out follows "Lost access to your email?" on the sign-in page
- **THEN** the help page explains recovery and shows the support address

### Requirement: The creator recovers a sign-in email after the new address confirms it
The creator SHALL start a recovery for a member with a new address and a reason (FR-11.5, DS-100). Tonaris SHALL email a code and a link to the new address. Only confirming them there SHALL change the email. The request alone SHALL change nothing. A new address that belongs to another account SHALL be refused, when the recovery starts and again when it is confirmed.

#### Scenario: Recovering
- **WHEN** the creator recovers Anna's account to a new address, and the new address's link is opened and confirmed
- **THEN** Anna's account signs in with the new address, keeping its data, and the old address signs in to nothing

#### Scenario: Waiting for the new address
- **WHEN** the creator has started a recovery that isn't confirmed yet
- **THEN** Anna's email is unchanged, her row shows "Waiting for verification", and the creator can cancel it, after which the link no longer works

#### Scenario: Another account's address
- **WHEN** the new address belongs to another account, at the start or by the time of confirming
- **THEN** the recovery is refused, and neither account changes

### Requirement: A recovery ends sessions and is audit-logged
Confirming a recovery SHALL, in one transaction: change the email, end all the account's sessions, disconnect its AI connections when the creator asked for that, and record the creator, the reason, and the old and new addresses in the audit log (TS-73). AI connections SHALL be kept otherwise. A deleted account SHALL never be recovered (FR-11.11).

#### Scenario: After confirming
- **WHEN** a recovery is confirmed while the account is signed in somewhere
- **THEN** that session is signed out, and the audit log has the recovery with its reason

#### Scenario: AI connections
- **WHEN** the creator ticked "Also disconnect AI connections"
- **THEN** the account's MCP connections are gone after confirming; without the tick they are kept
