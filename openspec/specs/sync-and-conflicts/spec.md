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
