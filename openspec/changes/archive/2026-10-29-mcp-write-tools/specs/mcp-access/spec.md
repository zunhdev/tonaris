# Spec Delta

## ADDED Requirements

### Requirement: Manage collection agents make ordinary changes by the app's rules
A Manage collection connection SHALL make FR-10.4's ordinary operations without the owner's approval, including in batches: organizing folders and lists, adding and editing albums, defining fields and unused options, arranging views, and keeping references. Every change SHALL be the app's own command, judged by the same rules (X-02), logged, and reaching the person's other sessions (X-08).

#### Scenario: A list in a new folder
- **WHEN** an agent creates the folder "Metal", a list "Doom" in it, and adds an album to the list
- **THEN** the app shows the album in Metal › Doom, and the person's other sessions see each change

#### Scenario: A used option
- **WHEN** an agent removes two options, one unused and one an album chooses
- **THEN** the unused one is removed, and the other fails with `field_in_use` and is kept

### Requirement: Agents supply links, and are asked what Tonaris can't tell
An agent SHALL add albums from links it found, and Tonaris SHALL never look for links itself (FR-10.5). A link Tonaris can't identify SHALL come back as `needs_input` asking for the album's details, and a link with several possible albums asking which. The agent SHALL answer by sending the item again with the choice or the details.

#### Scenario: A link it can't tell
- **WHEN** an agent adds a link no metadata source knows
- **THEN** the item is `needs_input` for `details`, and sending it again with the title, artist and year adds the album

### Requirement: Each item of a change reports its own outcome
A write SHALL answer each of its items with TS-27's outcome: confirmed, failed with a code and message, a conflict with the current values, a choice needed, or skipped (FR-10.9, FR-13.4). Independent items SHALL stay done when others fail. A step that needs another SHALL run only once that one is confirmed, and otherwise SHALL be skipped, naming it.

#### Scenario: A partial batch
- **WHEN** an agent adds two albums to a list, one without the required year
- **THEN** the first is in the list, and the second fails, its list step skipped

#### Scenario: A stale base
- **WHEN** an agent renames a list based on a name that has changed since
- **THEN** nothing changes, and the outcome is a conflict with the current name

### Requirement: Retrying a change by its key never repeats it
Every write SHALL accept an `idempotencyKey`, which is the connection's own (FR-13.5, TS-22). Sending the same key with the same arguments SHALL replay what ran, without doing it twice. A key reused for a different change SHALL be refused, changing nothing. A write without a key SHALL report the key it ran under, and `get_operation` SHALL report each step of a key's change.

#### Scenario: Sent twice
- **WHEN** an agent sends the same create_container call with the same key twice
- **THEN** one list exists, and both answers are the same

#### Scenario: A reused key
- **WHEN** an agent sends a different change under a key it already used
- **THEN** it is refused, and nothing changes

### Requirement: App-only operations can't be reached through MCP
No MCP tool SHALL purge Trash, manage sharing, change account settings, export, or administer admission, in either mode, with or without approval (X-03, AC-37). The commands for them SHALL refuse an MCP principal with `app_only`. A Read-only connection SHALL be refused any write tool, even called by name (FR-10.3).

#### Scenario: Commands refuse agents
- **WHEN** an MCP principal in Manage mode runs `trash.purge`, `share.invite`, `share.setLink`, `share.leave` or `account.setDisplayName`
- **THEN** each fails with `app_only`, and nothing changes

#### Scenario: Read-only by name
- **WHEN** a Read-only connection calls `create_container`
- **THEN** the call is refused as an unknown tool
