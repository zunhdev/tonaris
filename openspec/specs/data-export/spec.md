# data-export Specification

## Purpose

People can download their whole owned collection as one archive, so they own their data and can reuse it elsewhere (FR-08). This capability covers what the export contains and leaves out.

## Requirements

### Requirement: The export holds every album once
The export builder SHALL produce `tonaris-export.json` version 1.0 with its creation time (FR-08.3, FR-08.5, TS-81). It SHALL include every album the owner saved, active, in Unsorted or in Trash, exactly once, with its metadata, service links, identifiers, provenance and custom-field values.

#### Scenario: An album in two lists
- **WHEN** an album is in two lists and an owner exports
- **THEN** the album appears once in `albums`, and both lists' `albumIds` reference it

### Requirement: The export holds the structure around the albums
The export SHALL include the folder and list tree with names and descriptions, the custom fields with their types and options, the owner's remembered view choices and manual order with their account defaults, and Trash units with their dates, contents and former memberships (FR-08.3).

#### Scenario: Trash is marked
- **WHEN** an owner exports with a folder in Trash
- **THEN** the folder and its lists have `status` `trashed` and their unit's ID, and the unit gives its dates and former memberships

### Requirement: Unknown, unused and applied-empty stay distinct
The export SHALL keep unknown metadata as `null`, leave a field the album doesn't use out of its `fields`, and give a field applied without a value as `null`, and it SHALL state these conventions in the file (FR-08.3).

#### Scenario: Three kinds of empty
- **WHEN** an album has no year, doesn't use the field "Rating", and applies "Notes" empty
- **THEN** its `originalYear` is `null`, `fields` has no "Rating", and "Notes" is present with value `null`

### Requirement: The export leaves out what isn't the owner's collection
The export SHALL NOT contain credentials, sessions or AI connections; sharing invitations, grants, recipients or links; Shared with me references or other owners' content; the account's display name or sign-in email; or artwork image files (FR-08.4). Only the owner's collection tables SHALL be read.

#### Scenario: Shared and account data are absent
- **WHEN** an owner who shares a list, keeps another owner's list in Shared with me and has a display name exports
- **THEN** the export contains none of the recipient's address, the other owner's content, or the owner's name and email

### Requirement: The export reflects one point in time
The export SHALL be read in one read-only REPEATABLE READ transaction, so no half-applied change appears (FR-08.5, TS-80).

#### Scenario: A consistent snapshot
- **WHEN** a change commits while an export is being read
- **THEN** the export holds either all of the change or none of it

### Requirement: A withheld value is marked, never dropped
A value whose provider's policy forbids exporting SHALL be replaced with `{ "withheld": "provider-policy" }` (TS-15, FR-08.8).

#### Scenario: A withholding source
- **WHEN** a policy withholds a source's values and an album's title came from it
- **THEN** the album's `title` is the withheld marker, and its other values stay

### Requirement: The archive renders the collection readably
The export SHALL include `collection.md`, made from the export model (FR-08.2, TS-82). It SHALL render the folder tree as headings and each list as a table in the owner's arrangement, with the columns #, Title, Artist, Year, Type and Links and a column for each custom field the list's albums use. Unsorted and Trash SHALL follow as their own sections, Trash with each unit's deletion and expiry dates.

#### Scenario: A list in manual order
- **WHEN** an owner arranged a list by hand and exports
- **THEN** that list's table lists its albums in their manual order, under its folder's heading

#### Scenario: Trash with its dates
- **WHEN** a list is in Trash and the owner exports
- **THEN** the Trash section names it with the date it was deleted and the date it's deleted for good, and lists its albums

### Requirement: The archive explains itself
The export SHALL include `README.md`, explaining in plain English the files, every part of the JSON, the value conventions, versioning and what isn't included, written also for an AI tool reading the archive (FR-08.2, TS-82).

#### Scenario: Every part explained
- **WHEN** the export's format has a top-level part
- **THEN** the README names it

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
