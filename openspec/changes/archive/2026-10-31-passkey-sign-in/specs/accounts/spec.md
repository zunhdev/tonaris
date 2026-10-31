# Spec Delta

## MODIFIED Requirements

### Requirement: Only the sign-in endpoints are exposed
The API SHALL expose only the auth endpoints that sign-in needs: requesting a code, signing in with it, the passkey ceremonies that add a passkey and sign in with one, reading the session and signing out. Password, sign-up, profile-update and other auth endpoints, the passkey plugin's own list, rename and delete included, SHALL NOT be reachable, so account data changes only through `/v1` (FR-11.1, FR-11.3).

#### Scenario: Other auth endpoints are not found
- **WHEN** a client calls an auth endpoint outside that list, such as email-and-password sign-up or updating the user
- **THEN** it answers `404` with a `not_found` problem and changes nothing

#### Scenario: The plugin's own passkey management is not found
- **WHEN** a signed-in client calls the passkey plugin's list, update or delete endpoint
- **THEN** it answers `404` with a `not_found` problem and changes nothing

## ADDED Requirements

### Requirement: Sign in with a passkey
A member with a passkey SHALL sign in from `/sign-in` with **Sign in with a passkey**, or by choosing it from the email field's autofill (FR-11.1, DS-90). The passkey SHALL verify the person with a face, fingerprint or PIN. Signing in SHALL start the same 30-day session as a code and land on the page the person started from, an AI connection's authorization included.

#### Scenario: Signing in with a passkey
- **WHEN** a member with a passkey chooses **Sign in with a passkey** on `/sign-in` and confirms on their device
- **THEN** they are signed in and land in the workspace, without an email

#### Scenario: Continuing an AI connection
- **WHEN** an AI client sends a member to `/sign-in` and they sign in with a passkey
- **THEN** the authorization continues as it would after a code

#### Scenario: A passkey that doesn't verify the person
- **WHEN** an authenticator answers without verifying the person
- **THEN** no session starts, and the page says to use a passkey that asks for a face, fingerprint or PIN, or an email code

#### Scenario: A passkey the account no longer has
- **WHEN** someone signs in with a passkey removed from their account
- **THEN** no session starts, and the page says the passkey isn't on a Tonaris account anymore

### Requirement: Passkey sign-in shares the sign-in limit
Starting a passkey sign-in and finishing one SHALL each count toward the 20 sign-in steps per IP address per 15 minutes that code requests and code submissions share (TS-104, decided 31 October 2026). A refused step SHALL answer `429` with `Retry-After` and the `rate_limited` code, and change nothing.

#### Scenario: Passkey steps use up the limit
- **WHEN** one IP address has made 20 sign-in steps in 15 minutes, codes and passkeys together
- **THEN** a further passkey start or passkey sign-in from it is refused with `429`

### Requirement: Passkeys in Settings → Account
Settings → Account SHALL list the member's passkeys, newest first, each with its name and the day it was added (FR-11.13, DS-93). It SHALL add a passkey, rename one, and remove one. A new passkey SHALL be named after its password manager when known, and "Passkey" otherwise. A removed passkey SHALL stop signing in at once, and email codes SHALL keep working either way.

#### Scenario: Adding a passkey
- **WHEN** a member who signed in today chooses **Add a passkey** and confirms on their device
- **THEN** the passkey is listed with its name and today's date, and it signs them in from then on

#### Scenario: Renaming
- **WHEN** a member renames a passkey to "Work laptop"
- **THEN** the list shows "Work laptop" after a reload

#### Scenario: Removing
- **WHEN** a member removes a passkey
- **THEN** it leaves the list and no longer signs in, and an email code still does

#### Scenario: A device that already has one
- **WHEN** a member adds a passkey on a device that already holds one for their account
- **THEN** nothing is added, and the page says this device already has one

### Requirement: Adding a passkey needs a recent sign-in
Adding a passkey SHALL need a session started in the last day (FR-11.1). An older session SHALL first confirm with a code emailed to the sign-in address, under sign-in's rules and limits, and then add the passkey. Cancelling SHALL add nothing.

#### Scenario: An older session
- **WHEN** a member whose session started two days ago chooses **Add a passkey**
- **THEN** the page asks for the code sent to their sign-in email, and after it the passkey can be added

### Requirement: A new passkey is announced by email
Adding a passkey SHALL email the account's sign-in address (decided 31 October 2026). The email SHALL name the passkey and say to remove it in Settings → Account if the member didn't add it.

#### Scenario: The notice
- **WHEN** a member adds a passkey named "Google Password Manager"
- **THEN** their sign-in address gets an email saying a passkey "Google Password Manager" was added, and how to remove it

### Requirement: Recovery and deletion remove passkeys
Confirming a creator's recovery SHALL remove every passkey of the account in the same transaction (FR-11.5, decided 31 October 2026). Starting an account's deletion SHALL remove them with its sessions (FR-11.11). Changing the sign-in email SHALL keep them (FR-11.4). A removal SHALL survive a restored backup (TS-113).

#### Scenario: After a recovery
- **WHEN** a recovery is confirmed for an account with a passkey
- **THEN** the passkey no longer signs in, and the account has none

#### Scenario: After a deletion starts
- **WHEN** an account with a passkey is deleted
- **THEN** the passkey signs in to nothing, while the data is still being removed

#### Scenario: After an email change
- **WHEN** a member changes their sign-in email
- **THEN** their passkeys still sign them in

#### Scenario: A restore
- **WHEN** a backup from before a passkey's removal is restored and reconciled
- **THEN** the passkey stays removed
