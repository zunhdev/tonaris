# Spec Delta

## ADDED Requirements

### Requirement: A mutation still running says so
A mutation that waits on providers before taking the write lock, such as a capture, SHALL be recorded as running before it asks them (TS-22, FR-13.5). Its `mutationId` sent again while it runs SHALL be answered `409 in_progress`, and so SHALL `GET /v1/mutations/{id}`; nothing SHALL run twice. Once it ends, both SHALL answer its stored outcome. A run abandoned for 5 minutes SHALL be run again.

#### Scenario: Sent again while running
- **WHEN** a capture's request goes unanswered and the client sends it again while the first is still asking MusicBrainz
- **THEN** the second request answers `409 in_progress`, and the album is saved once

#### Scenario: Looked up while running
- **WHEN** the client asks `GET /v1/mutations/{id}` for that capture before it ends, and again after
- **THEN** it first answers `409 in_progress`, then the capture's outcome

#### Scenario: An abandoned run
- **WHEN** a capture was recorded as running more than 5 minutes ago and never finished, and it is sent again
- **THEN** it runs, and answers its outcome
