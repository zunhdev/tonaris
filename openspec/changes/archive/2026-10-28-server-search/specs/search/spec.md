# Spec Delta

## ADDED Requirements

### Requirement: Server search matches the app's
Search through the API SHALL use the same scope, matched fields, matching and order as the app's (X-02, FR-12.4, FR-12.5). Results SHALL come grouped as folders, lists and albums, each group with its total. Each result SHALL carry its location: a container's folder path, and an album's lists with their paths, or none for Unsorted. MCP's search SHALL return albums in the same order. One shared fixture SHALL be run against both the app's and the server's search.

#### Scenario: Same answer from app and API
- **WHEN** the parity fixture's collection is searched for "doom" in the app and through the API
- **THEN** both return the same folders, lists and albums, in the same order, with the same locations

#### Scenario: Accent-insensitive on the server
- **WHEN** an API client searches "bjork"
- **THEN** the album by "Björk" is returned with its original spelling

#### Scenario: MCP orders like the app
- **WHEN** an assistant searches "doom" through MCP
- **THEN** the albums come in the order the app shows them

### Requirement: Server search covers only the caller's active collection
Server search SHALL return only the caller's active owned content, Unsorted included (FR-12.1). Content in Trash and other accounts' content SHALL NOT appear.

#### Scenario: Trash on the server
- **WHEN** the owner's list "Sludge" is in Trash and an API client searches "sludge"
- **THEN** no result is returned

#### Scenario: Another account
- **WHEN** another account has a list "Doom" and the owner searches "doom" through the API
- **THEN** only the owner's own content is returned

### Requirement: Server search answers within 300 ms
Server search SHALL answer within 300 ms on the reference workload of 5,000 albums (FR-12.6, provisional Q-01 target).

#### Scenario: The reference workload
- **WHEN** the reference account with 5,000 albums is searched through the server
- **THEN** each query is answered within 300 ms
