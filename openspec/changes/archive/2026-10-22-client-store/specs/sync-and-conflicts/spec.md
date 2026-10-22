# Spec Delta

## ADDED Requirements

### Requirement: An edit shows as saved only once it is confirmed
An edit SHALL show at once, marked pending, and SHALL count as saved only after the server confirmed it and the change came back through the owner's stream (FR-09.3, FR-13.3). An edit with no answer, or no confirmation within 15 s, SHALL show as unconfirmed, never as saved. A rejected edit SHALL roll back and report why. Folders, lists, list entries and albums SHALL all be written this way.

#### Scenario: A confirmed edit
- **WHEN** an owner renames a list
- **THEN** the new name shows at once as pending, and as saved once the server confirmed it and it came back on the stream

#### Scenario: A rejected edit
- **WHEN** an owner creates a list whose name another list already has
- **THEN** the new list disappears, and the reason is reported

### Requirement: Unsent edits survive a reload
Edits not yet answered when their tab is reloaded or closed SHALL be kept in the browser and sent again by the next open tab of the same account (FR-13.5, PRD section 2.3). Sent again, an edit SHALL be applied once: never duplicated, and never overwriting a newer saved value. Until it is answered, it SHALL show as unconfirmed.

#### Scenario: Reloading while a save is in flight
- **WHEN** an owner adds an album, the server saves it, but the page reloads before the answer arrives
- **THEN** after the reload the edit is sent again, reported as saved, and the collection holds that album once

#### Scenario: Reloading before a save went out
- **WHEN** an owner edits an album while the API can't be reached, and reloads the page
- **THEN** after the reload the edit is sent once the API is reachable, and applied

### Requirement: Edits made while disconnected wait, then go out in order
While the connection is lost, the client SHALL report it, keep each new edit visible as pending or unconfirmed, and send the edits in the order they were made once the connection is back (PRD section 2.3, TS-22).

#### Scenario: Going offline and back
- **WHEN** the browser goes offline, the owner renames a list and then adds an album to it, and the browser comes back online
- **THEN** neither shows as saved meanwhile: the first, sent without an answer, as unconfirmed, and the one queued behind it as pending; once online they go out in order and show as saved, and the owner's other sessions receive them

### Requirement: Conflicts wait for review across reloads
An edit that met a newer saved value SHALL stay in the browser's review queue, with its attempted and current values, until the person resolves it, also across reloads of the same account (FR-09.4, TS-24).

#### Scenario: A conflict after a reload
- **WHEN** an edit came back as a conflict, and the owner reloads the page before reviewing it
- **THEN** the conflict is still waiting for review, with the attempted and current values

### Requirement: A rejected value never lingers
When an edit is rejected, the record's later edits that are still pending SHALL stop showing values built on it (FR-09.3). They SHALL still be sent, and SHALL show their saved values once confirmed.

#### Scenario: A conflict followed by an edit to another field
- **WHEN** an owner's title edit to an album is a conflict while their year edit to it is still pending
- **THEN** the album shows the saved title, never the rejected one, and the year edit is still saved

### Requirement: All tabs share one change stream
All of an account's open tabs in one browser SHALL share a single change stream, and each SHALL show every saved change (FR-09.1, TS-23). When the tab holding the stream closes, another SHALL take it over without missing a change.

#### Scenario: Two tabs
- **WHEN** an owner has two tabs open and saves an edit in the second
- **THEN** the browser holds one change stream, and both tabs show the edit as saved

#### Scenario: The streaming tab closes
- **WHEN** the tab holding the stream closes and a change is then saved in another session
- **THEN** the remaining tab opens the stream and shows the change

### Requirement: Many edits in one action go as one batch
Edits made together in one action SHALL be sent as one batch of at most 200 items per request, each with its own outcome (FR-13.4, TS-25).

#### Scenario: Adding several albums at once
- **WHEN** an owner adds three albums in one action
- **THEN** the client sends one batch, and each album shows its own outcome

### Requirement: Signing out asks about unsent edits, and clears the browser
Signing out SHALL delete the account's Tonaris data kept in the browser: unsent edits and the review queue (FR-11.1, FR-09.3, decided 22 October 2026). If edits are still unsent, it SHALL first ask, naming how many, and cancelling SHALL leave everything as it was.

#### Scenario: Signing out with unsent edits
- **WHEN** an owner with 2 unsent edits chooses Sign out
- **THEN** they are asked whether to sign out although 2 changes haven't been saved; confirming signs out and clears the browser's Tonaris data, and cancelling keeps them signed in with the edits still queued
