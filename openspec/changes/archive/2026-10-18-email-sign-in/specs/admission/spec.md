# Spec Delta

## Purpose

Who may hold a Tonaris account: accounts exist only through the creator's bootstrap or a creator's admission invitation, never through email verification alone (FR-11.2, FR-11.6; TS-71).

## ADDED Requirements

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
