# Spec Delta

## ADDED Requirements

### Requirement: Manage collection agents recover from Trash by the app's rules
A Manage collection connection SHALL recover Trash units within the retention window, each on its own, by the app's rules (FR-10.7, FR-01.13 to FR-01.16, FR-14.2). A missing or trashed folder SHALL ask for a destination, and a taken name for another, changing nothing until answered. Albums in Trash or gone SHALL be reported as skipped. Expired or purged units SHALL be unavailable, never recreated. Permanent removal SHALL stay in the app.

#### Scenario: A destination to choose
- **WHEN** an agent recovers a list whose folder is in Trash
- **THEN** it is asked for a destination, and sending it again with the top level recovers the list there

#### Scenario: Expired
- **WHEN** an agent recovers a unit past its 30 days
- **THEN** it fails as expired, and nothing comes back

#### Scenario: Read-only
- **WHEN** a Read-only connection lists Trash and calls `recover_from_trash`
- **THEN** it sees the units, and the call is refused as an unknown tool

### Requirement: MCP reports moves' and recoveries' sharing effects
Each folder or list an agent moves, and each unit it recovers, SHALL report its sharing effects as the app previews them: who newly sees it, who no longer sees it through the folders it leaves, and the shares it keeps (FR-07.14, FR-10.9). They SHALL need no approval.

#### Scenario: Into a linked folder
- **WHEN** an agent moves a list into a folder shared by link
- **THEN** the move's outcome says anyone with that folder's link now sees it
