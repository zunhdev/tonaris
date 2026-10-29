# Spec Delta

## ADDED Requirements

### Requirement: Changing the sign-in email verifies both addresses
A signed-in person SHALL change their sign-in email only after entering a code sent to their current address and then a code sent to the new address (FR-11.4, DS-93). Codes SHALL follow sign-in's rules: six digits, 10 minutes, 5 attempts. The new address SHALL be refused if it isn't an address, is the current one, or belongs to another account. Cancelling at any step SHALL change nothing.

#### Scenario: Changing it
- **WHEN** someone enters a new address, the code sent to their current address, and then the code sent to the new address
- **THEN** the page says "Done — use {new} to sign in", and the account's sign-in email is the new address

#### Scenario: The current address first
- **WHEN** someone starts a change
- **THEN** the first code goes to their current address only, naming the new address, and nothing goes to the new address yet

#### Scenario: Cancelling
- **WHEN** someone cancels at any step
- **THEN** the sign-in email stays as it was, and the codes sent no longer work

#### Scenario: Another account's address
- **WHEN** someone enters an address that belongs to another account
- **THEN** it is refused with an explanation, and nothing is sent

#### Scenario: Wrong codes
- **WHEN** a wrong code is entered, or five, or an expired one
- **THEN** it is refused as on sign-in, and the email doesn't change

### Requirement: The swap keeps the account and ends other sessions
The swap SHALL be one transaction: it SHALL change the account's email, end its other sessions, and record the change in the audit log (TS-73). The same account SHALL keep all its data and access, and need no new admission. The old address SHALL stop signing in. A change SHALL never take over or merge another account (FR-11.4, AC-39).

#### Scenario: After the swap
- **WHEN** the change completes in one browser while the account is also signed in elsewhere
- **THEN** this browser stays signed in, the other session is signed out, and the audit log records the old and new addresses

#### Scenario: The old address
- **WHEN** someone signs in with the old address after the change
- **THEN** no account is reached, and the new address signs in to the same account

#### Scenario: Taken meanwhile
- **WHEN** the new address gets an account of its own before the last code is entered
- **THEN** the change is refused, and neither account changes
