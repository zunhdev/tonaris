# Design

## Context

- **What G3 established:**
  - each client adds a custom MCP server;
  - all three register by CIMD and sign in through OAuth;
  - Tonaris's consent page asks for the mode.
- **Each client's own menus:** Claude's custom connectors (Customize › Connectors), ChatGPT's plugins (chatgpt.com/plugins), and Codex's MCP servers (the ChatGPT desktop app's Settings, or `codex mcp`).

## Goals / Non-Goals

**Goals:** steps a new user can follow alone, with prerequisites and the modes.

**Non-Goals:**
- a public help page outside the app;
- clients other than the three required ones (FR-10.1).

## Decisions

### 1. One client at a time

A segmented control (DS-20) picks Claude, ChatGPT or Codex, Claude first. The guide shows that client's prerequisites, then four numbered steps:
1. where to add a server;
2. the name and URL;
3. signing in and choosing a mode;
4. using it in a chat, or for Codex, the CLI's two commands.

Three clients' steps at once would be twelve lines on one page.

### 2. The vendor's words, checked against their help

The steps name menus and buttons as each client shows them, from the vendors' help pages, read on 29 October 2026:
- Anthropic's custom connectors article;
- OpenAI's custom MCP server guide;
- OpenAI's Codex MCP page.

ChatGPT's "+ Add" matches both the guide and what the creator saw in TON-22. The header comment of `setup-guide.tsx` says when they were checked, for when a client's UI changes.

### 3. Prerequisites, plainly

- **Claude:** works on any plan, but Free allows one custom connector, and Team or Enterprise members need an owner to add it.
- **ChatGPT:** needs a paid plan such as Plus (TON-22), and a workspace admin may have to allow it.
- **Codex:** runs in the ChatGPT desktop app or the CLI, signed in with ChatGPT, and both share their settings.

### 4. The modes in one place

The consent page's mode titles and descriptions move to `features/connections/modes.ts`, so both pages say the same. The guide adds that a deletion comes with a link to approve, waiting in Settings and under Approvals (TON-83).

## Risks / Trade-offs

- **[Vendors move their menus]** → The steps name the source and the date. TON-85's live run follows them in each client, and a change in a client is a one-file edit.

## Migration Plan

None.
