# mcp-access Specification

## Purpose

How AI agents reach the collection through MCP (FR-10): one server for Claude web, ChatGPT web and Codex, connections the person authorizes in a mode they choose, and inspects and revokes in the app.

## Requirements

### Requirement: One MCP server for the required clients
Tonaris SHALL serve one MCP server at the API's `/mcp`, through which Claude web, ChatGPT web and Codex desktop use the collection with the person's own AI account (FR-10.1). It SHALL speak the 2026-07-28 protocol and serve 2025-era clients through the stateless fallback. A request without a valid token SHALL get `401` pointing to the protected-resource metadata, so clients start sign-in. Tonaris SHALL have no built-in chat.

#### Scenario: Discovery
- **WHEN** a client sends its first request to `/mcp` without a token
- **THEN** it gets `401` naming `/.well-known/oauth-protected-resource/mcp` and the scopes `collection:read collection:manage offline_access`, and the metadata names the authorization server

#### Scenario: A 2025-era client
- **WHEN** a client connects with the 2025 `initialize` handshake, as Codex 0.162.1 does
- **THEN** it is served and lists the tools

### Requirement: Clients register by metadata document, with a limited fallback
The authorization server SHALL accept clients identified by a Client ID Metadata Document (CIMD), with token authentication `none` or `private_key_jwt`, fetching each document from public addresses only (FR-10.1). It SHALL keep dynamic client registration (DCR) as the fallback, limited to 10 registrations per IP address an hour, as the creator decided on 29 October 2026. It SHALL issue tokens only through the authorization-code grant with PKCE, and refresh tokens, never client credentials.

#### Scenario: A CIMD client
- **WHEN** a client whose ID is the URL of its metadata document starts an authorization
- **THEN** Tonaris fetches the document and the client connects without registering

#### Scenario: Too many registrations
- **WHEN** one address registers an eleventh client within an hour
- **THEN** the registration is refused with `429`, and the earlier clients still work

### Requirement: A connection covers the whole collection
A connection SHALL cover the person's whole collection: albums, folders, lists, field definitions, Unsorted, Trash and saved shared references (FR-10.2). There SHALL be no per-folder or per-list scopes. Other owners' content SHALL be reachable only as the person's sharing access allows (FR-07).

#### Scenario: No narrower scope
- **WHEN** a person connects a client
- **THEN** the consent page offers only the two modes, and the connection reads the collection's root

### Requirement: The person chooses the mode when connecting
The consent page SHALL name the client as it calls itself, labelled "as provided by the client", with its domain, and the signed-in account's email (FR-10.3, DS-85). It SHALL offer Read-only, preselected, and Manage collection when the client asked for it, and Cancel. The chosen mode SHALL be stored on the connection and enforced on every call. An MCP request's mode SHALL be what both its token and its connection grant, so consenting again as Read-only narrows tokens issued under Manage.

#### Scenario: Connecting without changing the mode
- **WHEN** a person signs in from a client's authorization request and presses Connect without changing the choice
- **THEN** the connection is Read-only, and the client gets the read scope and `offline_access` only

#### Scenario: Manage collection
- **WHEN** the person chooses Manage collection and connects
- **THEN** the client's tools include the write tools

#### Scenario: Cancel
- **WHEN** the person presses Cancel
- **THEN** the client gets `access_denied` and nothing is connected

#### Scenario: The client's domain
- **WHEN** Codex, identified by `https://chatgpt.com/oauth/codex/client.json`, asks for access with a loopback callback
- **THEN** the page says it is from chatgpt.com and returns to the loopback address

### Requirement: Connections are inspected and revoked in the app
Settings → Connections SHALL list each connection with its client name, mode, connected date and last use, newest first, with Revoke (FR-10.3, DS-86). Last use SHALL be recorded on MCP calls, to the minute. Revoking SHALL end the connection's access at its next call and refuse its refresh token. Changing a mode SHALL mean revoking and connecting again. A person SHALL see and revoke only their own connections.

#### Scenario: Last used
- **WHEN** a connected client makes its first call
- **THEN** its row changes from "Not used yet" to "Last used" with the time

#### Scenario: Revoking
- **WHEN** the person revokes a connection
- **THEN** the client's next call gets `401`, and its refresh token is refused

#### Scenario: Another account
- **WHEN** Ben tries to revoke Anna's connection
- **THEN** he gets `404`, and Anna's client still works

### Requirement: Connection management stays in the app
Listing and revoking connections SHALL be app-only (X-03): `/v1/connections` SHALL take the session cookie only, and no MCP tool SHALL manage connections. MCP tokens (audience `/mcp`) SHALL be refused on `/v1`, and tokens without the `/mcp` audience SHALL be refused on `/mcp` (TS-62).

#### Scenario: An MCP token on /v1
- **WHEN** a client sends its MCP access token to `/v1/connections`
- **THEN** it gets `401`, and nothing is listed

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

### Requirement: Gated operations wait for the owner's approval of the exact scope
Deleting into Trash, removing chosen options, deleting a field and confirming an uncertain match SHALL need the owner's approval in Tonaris (FR-10.6). The agent SHALL get the summary, the consequences and a link to the approval page. Nothing SHALL change until the owner approves; a declined or expired approval SHALL change nothing. One approval MAY cover a defined batch, and permission alone SHALL never replace it.

#### Scenario: Asking
- **WHEN** an agent asks to delete two albums
- **THEN** it gets `needs_approval` with "Move 2 albums to Trash", the lists they leave, the 30 days in Trash and a link, and nothing is deleted

#### Scenario: Declined
- **WHEN** the owner declines, and the agent calls again with the approval
- **THEN** it is told the owner declined, and nothing changes

### Requirement: Tonaris verifies the approval itself, and it covers only its scope
An approved operation SHALL run only if the approval is this connection's, for this operation, approved, unused and unexpired within 30 minutes, and the scope computed again under the owner's lock still hashes the same (FR-10.6, TS-64). The approval SHALL be used in the same transaction as the change, once. A scope that grew or changed SHALL get a fresh approval. Sending the same change's key again SHALL replay it, and any other change SHALL find the approval used.

#### Scenario: A grown scope
- **WHEN** an approved album joins another list before the agent calls again
- **THEN** nothing is deleted, and the agent gets a new approval naming both lists

#### Scenario: A grown option removal
- **WHEN** the owner approved removing two options, and one more album chooses one of them before the agent calls again
- **THEN** nothing is removed, and the new approval counts both albums

#### Scenario: Once
- **WHEN** an approved deletion ran, and the agent makes a new call with the same approval
- **THEN** it is told the approval was used, and nothing more changes

### Requirement: Confirmations name sharing effects and what stays
A deletion's approval SHALL name what goes with each folder, the albums that go to Unsorted because they are in no other list, the lists each album leaves, who no longer sees it, and the recovery window (FR-07.14, X-07). A field's deletion or an option's removal SHALL name how many albums lose it, in Trash included, and that it can't be undone. A match SHALL say whether the link joins an album already in the collection.

#### Scenario: A shared folder
- **WHEN** an agent asks to delete a linked folder holding a list with an album in no other list
- **THEN** the approval says the album goes to Unsorted, that anyone with the link no longer sees it, and that everything can be recovered for 30 days

### Requirement: The owner finds and decides requests in the app, on any device
The approval page SHALL show the request's client, summary, every part of its scope, its consequences and its expiry, and SHALL work on a phone (DS-87, X-04). Only the owner SHALL see or decide it; another account SHALL be told it belongs to another account. Settings → Connections SHALL list the requests waiting for a decision, and the sidebar SHALL show Approvals with their count while any wait (DS-86).

#### Scenario: Waiting
- **WHEN** an agent asked to delete an album and the owner opens Settings → Connections
- **THEN** "Waiting for your approval (1)" lists "Move 1 album to Trash" with Review, and the sidebar shows Approvals with 1

#### Scenario: On a phone
- **WHEN** the owner opens the approval link on a phone-sized screen and approves
- **THEN** the page fits without scrolling sideways, says to return to the client, and the agent's next call deletes the album

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

### Requirement: Tonaris shows how to connect each required client
Settings → Connections SHALL show the MCP server URL with Copy, and for Claude, ChatGPT and Codex in turn, the client's prerequisites and three or four steps in its own menu names, from adding the server to using it in a chat (FR-10.1, DS-86). It SHALL explain the two modes in the consent page's words, and that deletions come with a link to approve.

#### Scenario: Claude
- **WHEN** a person opens Settings → Connections
- **THEN** they see the server URL with Copy, Claude's prerequisites, four steps from Customize › Connectors to turning it on in a chat, and what Read-only and Manage collection allow

#### Scenario: Another client
- **WHEN** they pick Codex
- **THEN** the steps show the desktop app's MCP servers settings, and the CLI's `codex mcp add` and `codex mcp login` with the server URL
