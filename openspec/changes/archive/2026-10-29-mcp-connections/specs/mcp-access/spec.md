# Spec Delta

## ADDED Requirements

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
