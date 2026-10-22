# Spec Delta

## ADDED Requirements

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
