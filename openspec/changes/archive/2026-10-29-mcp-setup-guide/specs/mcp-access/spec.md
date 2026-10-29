# Spec Delta

## ADDED Requirements

### Requirement: Tonaris shows how to connect each required client
Settings → Connections SHALL show the MCP server URL with Copy, and for Claude, ChatGPT and Codex in turn, the client's prerequisites and three or four steps in its own menu names, from adding the server to using it in a chat (FR-10.1, DS-86). It SHALL explain the two modes in the consent page's words, and that deletions come with a link to approve.

#### Scenario: Claude
- **WHEN** a person opens Settings → Connections
- **THEN** they see the server URL with Copy, Claude's prerequisites, four steps from Customize › Connectors to turning it on in a chat, and what Read-only and Manage collection allow

#### Scenario: Another client
- **WHEN** they pick Codex
- **THEN** the steps show the desktop app's MCP servers settings, and the CLI's `codex mcp add` and `codex mcp login` with the server URL
