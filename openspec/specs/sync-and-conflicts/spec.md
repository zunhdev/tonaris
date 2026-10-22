# sync-and-conflicts Specification

## Purpose
How Tonaris judges and answers writes from the app, native clients and agents: a change made from a stale value never overwrites a newer one, every write reports one truthful outcome, batches keep their independent successes while dependent steps wait, and a retry never applies a change twice (FR-09.4, FR-13.3–FR-13.5).

## Requirements

### Requirement: A change made from a stale value is a conflict
A change SHALL name the values it was made from. If any of them no longer matches the saved value, the saved state SHALL be kept, nothing of that change SHALL be applied, and the outcome SHALL report each mismatched field's current, attempted and prior values (FR-09.4). Changes to different fields of one record SHALL both apply.

#### Scenario: A stale edit
- **WHEN** another session saved a new title after this session read the album, and this session saves a title and a year made from the old values
- **THEN** the newer title stays, the year isn't applied either, and the outcome reports the title's current, attempted and prior values

#### Scenario: Edits to different fields
- **WHEN** one session edits an album's title and another edits its year, each from the values it read
- **THEN** both edits apply

### Requirement: An account's writes are judged one at a time
Writes to one account SHALL be judged one after another, in the order they reach the server, each against the state the previous ones left (FR-09.4, TS-20). Two writes made at once from the same value SHALL never both apply.

#### Scenario: Two sessions save the same field at once
- **WHEN** two sessions save different titles for the same album at the same moment, both from its current title
- **THEN** exactly one title is saved, and the other write is a conflict reporting it

### Requirement: Every write reports a truthful outcome
Each write SHALL answer with one outcome: confirmed, failed with a reason, a conflict, waiting for input or approval, or skipped (FR-13.3). A write is confirmed only once it is saved. A request that can't be read as a write SHALL be refused as a whole, with a reason, and change nothing. A write's outcome SHALL remain retrievable by its ID for 30 days, so a client that got no answer can learn what happened (TS-22).

#### Scenario: A malformed request
- **WHEN** a client sends a write that names an unknown operation or carries a value of the wrong type
- **THEN** the request is refused as invalid, naming the bad values, and nothing changes

#### Scenario: Finding out after a lost answer
- **WHEN** a client sent a write but lost the answer, and asks for the outcome by the write's ID
- **THEN** it gets the outcome the write had; another account, or an ID never sent, finds nothing

### Requirement: Batches keep their independent successes
A batch SHALL run its items in order, each on its own, and keep every success even when other items fail (FR-13.4). Each item SHALL be judged by the same rules as on its own, including validation, limits, ownership and permissions. The answer SHALL give every item's outcome. An item that isn't a valid write SHALL fail on its own while the others run.

#### Scenario: A partial batch
- **WHEN** a batch creates three lists and the second's name is already taken
- **THEN** the first and third lists are created and stay, the second is reported as a name conflict, and each item has its own outcome

#### Scenario: An invalid item
- **WHEN** one item of a batch names an unknown operation
- **THEN** that item fails as invalid, and the other items run

#### Scenario: Batches follow the same rules
- **WHEN** a batch adds an album to another person's list
- **THEN** that item is refused as it would be on its own

### Requirement: Dependent items wait for confirmed prerequisites
A batch item SHALL be able to depend on earlier items of its batch. It SHALL run only after each of them is confirmed (FR-13.4). If a prerequisite failed, was a conflict, was skipped, or waits for input or approval, the item SHALL be skipped, changing nothing, with the prerequisite and its outcome as the reason. An item that depends on anything else SHALL fail as invalid.

#### Scenario: A failed prerequisite
- **WHEN** a batch creates a list and then adds an album to it, depending on the create, and the create fails
- **THEN** the addition is skipped, naming the create and its failure, and the album is in no new list

#### Scenario: Skips pass down the chain
- **WHEN** a third item depends on a second that was skipped
- **THEN** the third is skipped too, naming the second

#### Scenario: A confirmed prerequisite
- **WHEN** a batch creates a list and then adds an album to it, depending on the create, and the create succeeds
- **THEN** the album is in the new list

#### Scenario: A dependency on a later or unknown item
- **WHEN** an item depends on an item later in the batch, or on one not in it
- **THEN** it fails as invalid and changes nothing

### Requirement: Batches hold at most 200 items
A batch SHALL hold between 1 and 200 items, from any client (FR-15.4, TS-18, decided 22 October 2026). A larger or empty batch, or one that gives two items the same ID, SHALL be refused as a whole and change nothing.

#### Scenario: Too many items
- **WHEN** a client sends a batch of 201 items
- **THEN** it is refused as invalid, and none of its items run

### Requirement: Retries never apply a change twice
A write sent again with the same ID SHALL return the outcome of the first, without applying it again, whether the first has finished or is still running (FR-13.5). A batch sent again SHALL apply nothing twice: items already run report their outcomes, and the rest run. A write older than 30 days that has no record SHALL be refused as expired rather than run.

#### Scenario: Copies arriving together
- **WHEN** a client sends the same write five times at once
- **THEN** it is applied once, and every copy reports the same outcome

#### Scenario: A batch sent again
- **WHEN** a client sends a batch again after losing the answer
- **THEN** every item reports the outcome it had, nothing is applied twice, and items skipped the first time are judged again

#### Scenario: A very old retry
- **WHEN** a client sends a write made more than 30 days ago whose record is gone
- **THEN** it is refused as expired, and nothing changes

### Requirement: Saved changes reach every open session of the owner
A saved change SHALL reach the owner's other open sessions without a manual refresh, in the order it was saved (FR-09.1). A session that starts SHALL load the owner's data as of one point, then receive every change after that point, with none missed or repeated (TS-23, TS-24).

#### Scenario: Another session sees a change
- **WHEN** an owner saves a change in one session while another of their sessions is open
- **THEN** the other session receives it without reloading

#### Scenario: Starting during writes
- **WHEN** a session loads the owner's data while other sessions are saving changes
- **THEN** the data it loads is consistent with one point in the change sequence, and it then receives exactly the changes after that point

### Requirement: Interrupted streams resume where they stopped
A client that loses its change stream SHALL reconnect from the last change it received and get every later change, with none missed or repeated (FR-09.1, TS-23). A quiet stream SHALL be kept open with periodic keepalives.

#### Scenario: A cut stream resumes
- **WHEN** a client's stream is cut after it received some changes, more are saved, and it reconnects from its last change
- **THEN** it receives the later changes, without a gap and without repeats

#### Scenario: A quiet stream stays open
- **WHEN** no change is saved for longer than the server's idle timeout
- **THEN** the stream stays open

### Requirement: A stream that can't be continued says so
When a client reconnects from a point the server can no longer continue, the server SHALL tell it to load the owner's data again and end the stream, rather than send an incomplete history (TS-23). That covers a point older than the 30 days of kept history, and one the server never had.

#### Scenario: A cursor older than the history
- **WHEN** a client reconnects from a change that has since been pruned
- **THEN** it is told to load the data again, and the stream ends

#### Scenario: A cursor the server never had
- **WHEN** a client reconnects from a point beyond the owner's latest change
- **THEN** it is told to load the data again, and the stream ends

### Requirement: Streams end with their session
A change stream SHALL end within 30 seconds once the session that opened it is signed out, revoked or expired, and reconnecting with it SHALL be refused as unauthenticated (FR-09.1, TS-23). Other sessions' streams SHALL continue.

#### Scenario: Signing out ends the session's streams
- **WHEN** a person signs out while a stream of that session is open, and another session of theirs streams too
- **THEN** the signed-out session's stream ends, its reconnect is refused, and the other session keeps streaming

### Requirement: The sync history is kept for 30 days
Change history and write outcomes SHALL be kept for 30 days, and removed once older, at least daily (TS-22, TS-23, TS-91). Only one server SHALL remove them at a time.

#### Scenario: Old history is pruned
- **WHEN** the daily prune runs
- **THEN** changes and write outcomes older than 30 days are gone, and newer ones remain

#### Scenario: One pruner at a time
- **WHEN** two servers start the prune at the same moment
- **THEN** only one of them runs it

### Requirement: Large responses travel compressed
JSON responses of 1 KB or more SHALL be sent gzipped to clients that accept gzip, so a new session loads quickly (Q-01, TS-120). The change stream SHALL never be compressed, so each change is delivered as soon as it is sent.

#### Scenario: A compressed snapshot
- **WHEN** a client that accepts gzip loads the owner's data
- **THEN** the response is gzipped and decodes to the same data

#### Scenario: Clients without gzip, and the stream
- **WHEN** a client that doesn't accept gzip loads the owner's data, or any client opens the change stream
- **THEN** the response isn't compressed

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

### Requirement: Unsaved edits show their save state
Each edit not yet saved SHALL show its state, as an icon combined with text (FR-09.3, FR-13.3, DS-80, DS-115):
- *pending*, once it has waited 300 ms;
- *unconfirmed*;
- *failed*;
- *conflict*.

A confirmed edit SHALL show no marker and raise no message. Pending edits SHALL never block further editing.

#### Scenario: A slow save
- **WHEN** an owner creates a list and the server takes a second to answer
- **THEN** the workspace shows that it is saving, and once the list is confirmed it shows no save state and no message

#### Scenario: A save without an answer
- **WHEN** an owner's edit is sent but its answer is lost
- **THEN** it is shown as waiting to confirm, never as saved, until it is reconciled

### Requirement: The workspace reports its connection
The workspace SHALL always show whether it is connected, reconnecting or offline (FR-09.3, PRD section 2.3, DS-81).
- **Offline:** the browser reports no network, or the change stream has been down for 15 s. The main view then shows a banner saying it shows what was last loaded.
- **Connected:** the indicator says "Saving…" for a save waiting 300 ms, and counts the changes waiting to confirm and those needing review.

#### Scenario: Going offline and back
- **WHEN** the browser loses its network and later gets it back
- **THEN** the workspace shows it is offline, with the banner, and once back it shows it is up to date, without the banner

#### Scenario: The server can't be reached
- **WHEN** the change stream drops while the browser still has a network
- **THEN** the workspace shows it is reconnecting, and after 15 s without the stream it shows it is offline

#### Scenario: Changes waiting to confirm
- **WHEN** an owner's two edits are sent without an answer while the stream is connected
- **THEN** the indicator says 2 changes are waiting to confirm

### Requirement: Activity lists every change not yet saved
Opening the sync indicator SHALL list each pending, unconfirmed, failed and conflicting change, with what it was, its state and its next step (FR-09.3, FR-13.2, DS-81). A failed or conflicting change SHALL stay listed, also across reloads of the same account, until the person retries, resolves or dismisses it.

#### Scenario: A failure waits in Activity
- **WHEN** an owner's edit fails, they close its message and reload the page
- **THEN** Activity still lists the failure with its reason, until they dismiss it

#### Scenario: Pending changes are listed
- **WHEN** an owner opens Activity while an edit is waiting to confirm
- **THEN** Activity lists it as waiting to confirm, with what it changes

### Requirement: A failed edit is reported until dealt with, and can be retried
A rejected edit SHALL raise a message naming what couldn't be saved and why, which stays until closed and offers Retry (FR-09.3, FR-13.1, FR-13.2, DS-80). Retry SHALL make the same change again, judged against the current saved values. It SHALL be listed as a new change until confirmed.

#### Scenario: Retrying after fixing the cause
- **WHEN** an owner's new list fails because its name is taken, and after renaming the other list they choose Retry
- **THEN** the message said which list couldn't be saved and why, and the retried list is saved

### Requirement: Conflicts are resolved by a deliberate choice
A conflicting edit SHALL raise a message that stays until closed and leads to a review (FR-09.4, DS-80). For each conflicting field, the review shows the current saved value beside the attempted one.
- **Keep current** SHALL discard the attempt.
- **Apply mine** SHALL save the attempt over the current value, as a new change judged against it.

Nothing SHALL be applied without that choice.

#### Scenario: Apply mine
- **WHEN** an owner renames a list that another session renamed meanwhile, opens the review and chooses Apply mine
- **THEN** the review showed the other session's name as current and theirs as attempted, and their name is saved

#### Scenario: Keep current
- **WHEN** an owner reviews such a conflict and chooses Keep current
- **THEN** the other session's name stays, and the conflict is no longer listed

#### Scenario: Reviewing after a reload
- **WHEN** an owner reloads the page before reviewing a conflict
- **THEN** Activity still offers the review, with both values

### Requirement: Changes from elsewhere are told apart from one's own
The client SHALL tell changes saved by another session, tab or agent from those this tab made (FR-09.1, DS-82). Views can then highlight a record changed elsewhere for 1.2 s with a fade, or with a static tint under reduced motion. This tab's own confirmed edits SHALL NOT count as changes from elsewhere.

#### Scenario: Another session's change
- **WHEN** another session renames a list while this tab is open
- **THEN** this tab reports the list as changed elsewhere

#### Scenario: One's own change
- **WHEN** this tab renames a list and the change is confirmed
- **THEN** the list is not reported as changed elsewhere

### Requirement: Save problems and going offline are announced
Failures, conflicts and going offline SHALL be announced to assistive technology assertively (Q-02, DS-83). Routine confirmed saves SHALL NOT be announced. Other features SHALL announce through the same polite and assertive regions.

#### Scenario: Going offline is announced
- **WHEN** the browser loses its network
- **THEN** an assertive announcement says the workspace is offline and changes can't be saved

#### Scenario: A failure is announced
- **WHEN** an owner's edit fails
- **THEN** the failure is announced assertively, while a confirmed edit is not announced at all
