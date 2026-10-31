# accounts Specification

## Purpose
How people prove who they are to Tonaris and stay signed in: passwordless sign-in by an emailed code or link, or a passkey, the session the web app and API share, sign-out, and the signed-in account's identity (FR-11.1).

## Requirements

### Requirement: Sign in with an emailed code
A person with an account SHALL sign in by entering their email and then the 6-digit code emailed to it (FR-11.1, DS-90). A code SHALL be valid for 10 minutes, work once, and allow 5 attempts. Requesting a new code SHALL replace the old one. Email addresses SHALL match case-insensitively, so a person reaches the same account however they type it.

#### Scenario: The creator signs in with a code
- **WHEN** the creator enters their email on `/sign-in` and then the code from the email on `/sign-in/verify`
- **THEN** they are signed in and land in the workspace

#### Scenario: Email case does not matter
- **WHEN** a person with the account `creator@example.com` asks for a code as `Creator@Example.COM`
- **THEN** the code arrives at that account's address and signs them in to that same account

#### Scenario: A wrong code is rejected
- **WHEN** a person enters a code that does not match
- **THEN** they are not signed in and are told the code is not right

#### Scenario: A code works once
- **WHEN** a code that has already signed someone in is submitted again
- **THEN** it is rejected

#### Scenario: A code expires
- **WHEN** a code is submitted more than 10 minutes after it was sent
- **THEN** it is rejected and the person is offered a new code

#### Scenario: Too many wrong attempts void the code
- **WHEN** 5 wrong codes have been submitted for one request
- **THEN** even the correct code is rejected until a new one is requested

### Requirement: The sign-in email carries a link
The sign-in email SHALL contain both the code and a link to `/sign-in/verify` that submits the same code (TS-70). In the browser that asked for the code, opening the link SHALL sign in without further input and land on the original destination. Anywhere else, the page SHALL first ask "Sign in on this device?" with **Sign in** and **Cancel** (DS-90).

#### Scenario: The link signs in the same browser
- **WHEN** a person asks for a code from a page and then opens the email's link in the same browser
- **THEN** they are signed in without typing the code and land on the page they started from

#### Scenario: The link on another device asks first
- **WHEN** the link is opened in a browser that did not ask for the code
- **THEN** the page asks "Sign in on this device?", and only **Sign in** signs that browser in

#### Scenario: A used or expired link is explained
- **WHEN** a link whose code was already used or has expired is opened
- **THEN** the page says "This sign-in link has expired or was already used" and offers **Send a new code**

### Requirement: Resending a code
The code screen SHALL offer a resend button that is unavailable for 30 seconds after each code is sent, and "Use a different email", which returns to the email step (DS-90).

#### Scenario: Resend waits 30 seconds
- **WHEN** a code has just been sent
- **THEN** the resend button is disabled and counts down, and after 30 seconds it sends a new code

### Requirement: Sign-in requests are rate limited
Code requests SHALL be limited to 5 per email address per 15 minutes. Code requests and code submissions together SHALL be limited to 20 per IP address per 15 minutes (TS-104, approved 18 October 2026). A refused request SHALL answer `429` with `Retry-After` and the `rate_limited` code. It SHALL change nothing (X-05), and the page SHALL say when to try again.

#### Scenario: A sixth code request for one email is refused
- **WHEN** a sixth code is requested for the same email address within 15 minutes
- **THEN** the request is refused with `429`, `rate_limited` and `Retry-After`, and no email is sent

#### Scenario: One address cannot flood sign-in
- **WHEN** one IP address makes more than 20 code requests and submissions within 15 minutes
- **THEN** the further requests are refused with `429` until the window allows more

### Requirement: The session works on the web and API hosts
A successful sign-in SHALL set the session cookie `__Secure-tonaris.session_token`: `Secure`, `HttpOnly`, `SameSite=Lax`, and in production scoped to the parent domain, so it reaches both `tonaris.<tld>` and `api.tonaris.<tld>` (TS-08, TS-70). Sessions SHALL last 30 days, renewed while in use. The API SHALL accept credentialed requests only from the web origin.

#### Scenario: The cookie has the agreed attributes
- **WHEN** a person signs in
- **THEN** the response sets `__Secure-tonaris.session_token` with `Secure`, `HttpOnly`, `SameSite=Lax`, a 30-day lifetime, and in production `Domain=<parent domain>`

#### Scenario: The web app's calls to the API are signed in
- **WHEN** the signed-in web app calls the API from the browser
- **THEN** the API recognizes the session, and its CORS response allows the web origin with credentials

#### Scenario: Other origins get no credentialed CORS
- **WHEN** a page on any other origin calls the API
- **THEN** the response does not allow that origin

#### Scenario: Sessions roll over
- **WHEN** a session more than a day old is used
- **THEN** its expiry moves to 30 days from now and the cookie is renewed

### Requirement: Signed-in account
`GET /v1/me` SHALL return the signed-in person's account: id, email, display name (or none) and role. Without a valid session it SHALL answer `401` with the `unauthenticated` code. Every signed-in API request SHALL act as the TS-30 `user` principal for that account (FR-11.1).

#### Scenario: The signed-in account
- **WHEN** a signed-in person calls `GET /v1/me`
- **THEN** the response is their id, email, display name and role

#### Scenario: Not signed in
- **WHEN** `GET /v1/me` is called without a session, or with one that was signed out or has expired
- **THEN** it answers `401` with an `unauthenticated` problem

### Requirement: Sign out
A signed-in person SHALL be able to sign out from the sidebar's account menu, which shows their display name, or their email when they have none (FR-11.1, DS-31). Signing out SHALL end the session on the server and clear the cookie, and the workspace SHALL then ask them to sign in again.

#### Scenario: Signing out
- **WHEN** a signed-in person chooses **Sign out** in the account menu
- **THEN** they land on `/sign-in`, the API no longer accepts their old session, and opening `/c` asks them to sign in

### Requirement: Only the sign-in endpoints are exposed
The API SHALL expose only the auth endpoints that sign-in needs: requesting a code, signing in with it, the passkey ceremonies that add a passkey and sign in with one, reading the session and signing out. Password, sign-up, profile-update and other auth endpoints, the passkey plugin's own list, rename and delete included, SHALL NOT be reachable, so account data changes only through `/v1` (FR-11.1, FR-11.3).

#### Scenario: Other auth endpoints are not found
- **WHEN** a client calls an auth endpoint outside that list, such as email-and-password sign-up or updating the user
- **THEN** it answers `404` with a `not_found` problem and changes nothing

#### Scenario: The plugin's own passkey management is not found
- **WHEN** a signed-in client calls the passkey plugin's list, update or delete endpoint
- **THEN** it answers `404` with a `not_found` problem and changes nothing

### Requirement: The display name in Settings → Profile
Settings → Profile SHALL show the display name and save a change when the field loses focus or on Enter (FR-11.3, DS-93). The name SHALL be optional: clearing it SHALL remove it while the person shares nothing. While they share, clearing SHALL be refused with an inline explanation, and the saved name SHALL stay (AC-38). The account menu SHALL show the name after a change, or the email once it is cleared.

#### Scenario: Setting a name
- **WHEN** someone types "Mira" in Display name and leaves the field
- **THEN** it is saved, the account menu reads "Mira", and the field still shows it after a reload

#### Scenario: Clearing while sharing nothing
- **WHEN** someone who shares nothing clears the field and leaves it
- **THEN** the name is removed, and the account menu shows their email

#### Scenario: Clearing while sharing
- **WHEN** someone with a link on clears the field and leaves it
- **THEN** the page says "People you share with see your display name. Stop sharing to clear it.", the field shows the saved name again, and the name is kept

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

### Requirement: Deleting the account is warned and confirmed
Settings → Account SHALL offer **Delete account** in a Danger zone (DS-97). Its dialog SHALL list the full consequences: the collection, Unsorted and Trash are removed, settings and saved references are removed, shared content becomes unavailable to every viewer and guest, AI connections end, and nothing can be recovered (FR-11.10). Deleting SHALL need the sign-in email typed and **Delete account permanently**, in the app only (X-03). Cancelling SHALL change nothing.

#### Scenario: The warning
- **WHEN** someone opens Delete account
- **THEN** the dialog lists every consequence, and **Delete account permanently** works only once their sign-in email is typed

#### Scenario: Cancelling
- **WHEN** they close the dialog
- **THEN** nothing changes

### Requirement: The creator's account can't be deleted
The creator's account SHALL NOT be deletable, since it runs admissions and is the only one with the role (TS-71).

#### Scenario: The creator
- **WHEN** the creator asks to delete their account
- **THEN** it is refused with an explanation, and their Danger zone offers no Delete account

### Requirement: Deletion stops access at once and removes all owned data
Confirming SHALL at once end the account's sessions and AI connections, make its shared content unavailable to every viewer and guest, and stop its address from signing in (FR-11.11). Then all owned data SHALL be removed permanently, Trash included and nothing moved to Trash, and the account itself last. Other people's collections SHALL be untouched. Progress, completion and failure SHALL be reported, and a failure SHALL be retryable without claiming partial success.

#### Scenario: Access stops
- **WHEN** an account that shares a list by link and by invitation, and has an AI connection, is deleted
- **THEN** its sessions are signed out, the link's guest page and the invited viewer find the list unavailable, and the AI connection is gone

#### Scenario: Everything owned goes
- **WHEN** the deletion finishes
- **THEN** the page says "Your account has been deleted", and none of the account's folders, lists, albums, fields, Trash, settings or references remain, while another member's collection is unchanged

#### Scenario: Signing in later
- **WHEN** someone signs in with the deleted account's address
- **THEN** no account is reached or recreated, and a new account needs an invitation

#### Scenario: A failure
- **WHEN** the deletion job fails
- **THEN** the page says it couldn't finish and offers Retry, which runs it again

### Requirement: The sign-in page says what Tonaris is
Both sign-in steps SHALL show, beside the card, what Tonaris does and what sets it apart: AI agents through MCP, folders within folders and lists, sharing, and export, and that it is invitation-only (DS-90). The card SHALL come first for keyboard and screen-reader users, and first on a phone. Other pages in the sign-in frame SHALL NOT show it.

#### Scenario: On the desktop
- **WHEN** a visitor opens the sign-in page on a desktop browser
- **THEN** the promo is on the left and the sign-in card on the right

#### Scenario: On a phone
- **WHEN** a visitor opens the sign-in page on a phone
- **THEN** the sign-in card comes first, and the promo below it

#### Scenario: Another page in the frame
- **WHEN** a person opens an approval page
- **THEN** it shows the card without the promo

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
