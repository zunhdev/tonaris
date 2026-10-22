# Spec Delta

## Purpose

How Tonaris judges and answers writes from the app, native clients and agents: a change made from a stale value never overwrites a newer one, every write reports one truthful outcome, batches keep their independent successes while dependent steps wait, and a retry never applies a change twice (FR-09.4, FR-13.3–FR-13.5).

## ADDED Requirements

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
