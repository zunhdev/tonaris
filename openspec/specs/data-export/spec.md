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
