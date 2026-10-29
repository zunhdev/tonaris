# accounts Specification

## Purpose
How people prove who they are to Tonaris and stay signed in: passwordless sign-in by an emailed code or link, the session the web app and API share, sign-out, and the signed-in account's identity (FR-11.1).

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
The API SHALL expose only the auth endpoints that sign-in needs: requesting a code, signing in with it, reading the session and signing out. Password, sign-up, profile-update and other auth endpoints SHALL NOT be reachable, so account data changes only through `/v1` (FR-11.1, FR-11.3).

#### Scenario: Other auth endpoints are not found
- **WHEN** a client calls an auth endpoint outside that list, such as email-and-password sign-up or updating the user
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
