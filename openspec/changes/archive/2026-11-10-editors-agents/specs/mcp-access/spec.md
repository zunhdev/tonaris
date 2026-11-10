# Spec Delta

## ADDED Requirements

### Requirement: Editors' agents change the shares they edit
A Manage collection connection SHALL change a folder, list or album in a share its person can edit, as the person can in the app, and SHALL be answered as for missing content outside it (FR-10.4, FR-07.19, FR-07.20). Shared with me SHALL give each share's role. A Read-only connection SHALL only read.

#### Scenario: Renaming a shared list
- **WHEN** Anna's Manage agent renames Denis's list "Doom", which she can edit
- **THEN** the change is confirmed, in Denis's collection

#### Scenario: Outside the share
- **WHEN** Anna's Manage agent renames Denis's unshared list "Secret", or changes an album only in it
- **THEN** each is answered as not found, and nothing changes

#### Scenario: The role in Shared with me
- **WHEN** Anna's agent lists Shared with me
- **THEN** "Doom" has the role edit

### Requirement: The owner's definitions and Trash stay the owner's through MCP
An editor's agent SHALL NOT change the owner's custom fields or options, or recover anything from the owner's Trash (FR-07.20, FR-10.7).

#### Scenario: Renaming the owner's field
- **WHEN** Anna's Manage agent renames Denis's field "Rating"
- **THEN** it is refused, and the field keeps its name
