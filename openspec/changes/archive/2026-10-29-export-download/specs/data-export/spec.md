# Spec Delta

## ADDED Requirements

### Requirement: The owner downloads the archive from the app
`GET /v1/export` SHALL answer the signed-in owner with a ZIP of `tonaris-export.json`, `tonaris-export.schema.json`, `collection.md` and `README.md`, named `tonaris-export-YYYYMMDD-HHmm.zip`, built from one read-only snapshot (FR-08.1, TS-80). It SHALL require a session, and exporting SHALL change no data.

#### Scenario: A download
- **WHEN** a signed-in owner asks for an export
- **THEN** they get a dated ZIP of the four files, and their collection is unchanged

#### Scenario: No session
- **WHEN** a request without a session asks for an export
- **THEN** it is refused with `401`

### Requirement: Five exports an hour
An account SHALL be limited to 5 exports per hour (TS-18). Over the limit, the export SHALL be refused with `rate_limited`, `Retry-After`, and how long to wait. A failed export SHALL not count.

#### Scenario: The sixth export
- **WHEN** an owner has exported 5 times in the last hour and asks again
- **THEN** they are refused with `rate_limited`, told how many minutes to wait, and given `Retry-After`

### Requirement: The app shows the export's progress
Settings → Data SHALL offer "Download your data", saying what the archive includes and leaves out, and SHALL show it preparing, then downloading with "Download again", or failed with the reason and Retry (FR-08.6, DS-96). The account-deletion dialog SHALL offer the same download first (FR-08.7, DS-97).

#### Scenario: From Settings → Data
- **WHEN** an owner presses "Download your data"
- **THEN** the archive downloads, and "Download again" offers it once more

#### Scenario: Before deleting the account
- **WHEN** an owner opens the account-deletion dialog
- **THEN** it offers "Download your data first" before the confirmation

#### Scenario: A refused export
- **WHEN** the export fails or is refused
- **THEN** the reason shows with Retry
