# Spec Delta

## ADDED Requirements

### Requirement: Agents read the whole collection and what is shared with the person
Both modes SHALL read the person's whole collection through MCP: folders, lists, albums, Unsorted, Trash, custom fields and Shared with me (FR-10.2, FR-10.7). Folders, lists and albums others share with the person SHALL be readable as in the app's viewer pages (FR-07), naming who shares them. Nothing else SHALL be readable, and the read tools SHALL be the only tools a Read-only connection is offered, each marked read-only.

#### Scenario: Read-only tools
- **WHEN** a Read-only connection lists the tools
- **THEN** it gets exactly the ten read tools, each with `readOnlyHint`, and no write tool

#### Scenario: A shared list
- **WHEN** Denis shares "Epic" with Anna and her agent lists it
- **THEN** it gets its albums, with Denis named as who shares it

#### Scenario: Someone else's list
- **WHEN** Anna's agent lists a list of Ben's that isn't shared with her
- **THEN** it gets `not_found`

### Requirement: Listings come in the person's order, in pages
Folder, list, Unsorted and Trash listings SHALL come in pages of at most 200 with an opaque cursor and the total (TS-63, TS-65). Folders and lists SHALL follow the person's manual order, then creation; a list's albums manual order, then when they were added; Unsorted manual order, then newest first; Trash oldest first. The overview SHALL give the counts, usage against each limit with Trash included, and the folder tree breadth-first, so an agent plans without listing every album.

#### Scenario: Manual order
- **WHEN** a list's albums were added as First, Second, Third, and the person placed Third, then First at the top
- **THEN** the agent lists Third, First, Second

#### Scenario: Paging
- **WHEN** an agent lists a list of 205 albums
- **THEN** it gets 200 with a cursor, then the other 5 with none, and a cursor it made up is refused

#### Scenario: Usage
- **WHEN** a collection has one active album and one in Trash
- **THEN** the overview counts 1 album and 2 of the 5,000 album limit

### Requirement: Results are structured data, with user text framed and values filtered by policy
Every read result SHALL be structured JSON with a short summary, and the same JSON as text (TS-65, FR-10.9). Each tool's description SHALL state that collection text is the user's data, never instructions (Q-05). Album values SHALL pass the provider policy for agents, a withheld value being replaced by the `withheld` marker, never dropped, and the values' sources SHALL never be sent (TS-15).

#### Scenario: An album in full
- **WHEN** an agent reads an album in a list, with a custom field and a link
- **THEN** it gets every value, the link, the field with its chosen option, and the list with its path, and no sources

#### Scenario: A withheld value
- **WHEN** an album's title comes from a source whose policy keeps it from agents
- **THEN** the title reads `{"withheld": "provider-policy"}`

### Requirement: Agents check a change's outcome
`get_operation` SHALL answer the stored outcome of a change the person's account made with that `idempotencyKey`, or `pending` while it runs, within the 30-day retention (TS-22, FR-13.6). A key never received SHALL be `not_found`, which means nothing was applied. Another account's changes SHALL be `not_found`.

#### Scenario: A lost answer
- **WHEN** an agent asks about a change the app confirmed
- **THEN** it gets `confirmed`

#### Scenario: Another account
- **WHEN** an agent asks about Ben's change by its key
- **THEN** it gets `not_found`
