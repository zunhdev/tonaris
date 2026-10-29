# Proposal

Linear: TON-86 (Design). Implements FR-10.1's connection instructions. Design: DS-86. Done when a new user can connect each client using only these instructions.

## Why

Settings → Connections offers only the server URL and one line of help. FR-10.1 asks Tonaris to provide connection instructions, including each client's prerequisites. DS-86 asks for 3–4 steps each for Claude web, ChatGPT web and Codex desktop. Each client adds a remote MCP server its own way, behind plan and workspace rules a new user can't guess.

## What Changes

- **"Connect an AI client"** in Settings → Connections:
  - the server URL with Copy;
  - a picker for Claude, ChatGPT and Codex;
  - each client's prerequisites and four steps.
- **The steps** follow each vendor's help as of 29 October 2026. They name the menus as the client shows them, and end with using Tonaris in a chat.
- **"What a client may do"** gives the consent page's two mode descriptions, and says how approvals reach the person.
- **The consent page and the guide** share the mode text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: in-app connection instructions.

## Impact

- **`apps/web`:** `features/connections/setup-guide.tsx` and `modes.ts`, Settings → Connections, and the consent page's import.
- **Docs:** DS-86 as built.
- **No API change.**
