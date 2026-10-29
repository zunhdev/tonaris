# Spec Delta

## ADDED Requirements

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
