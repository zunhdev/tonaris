# Design

## Context

- **`trash.recover {unitId, parentId?, name?}`** (TON-55, TON-56) already answers `needs_input` for a destination or a name (TS-26), and reports skipped albums or lists in its confirmed result.
- **`sharingImpact()`** previews a move's or a recovery's sharing consequences for the app (TON-71).
- **The hourly purge** removes expired units; until it runs, a unit past `expires_at` is still in the table.

## Goals / Non-Goals

**Goals:**
- recovery through MCP;
- sharing effects on MCP's moves and recoveries;
- expiry enforced.

**Non-Goals:**
- permanent removal, which stays app-only (X-03);
- rate limits (TON-85).

## Decisions

### 1. One tool over the app's command

`recover_from_trash` plans one `trash.recover` per unit, through `mcpWriter()` like every write:
- each unit runs on its own, so independent units recover while another waits for a choice (FR-14);
- the agent answers a `needs_input` by sending that item again with `parentId` or `name`;
- the candidates name the unit, its name, the parent it can't return to, and why.

### 2. Sharing effects, previewed as the app does

Before the write, the tool reads `sharingImpact()` for each move or recovery, and reports the audiences that newly see it, no longer see it, and keep their direct shares:
- each as a person by name, invited or accepted, or as "anyone with the link";
- each with the folder or list it comes through.

The effects are reported, not approved: ordinary moves and recovery need no approval (FR-07.14).

### 3. Expiry in the command

`recoverUnit` refuses a unit at or past `expires_at` as `expired`, before anything else. The app and MCP agree (X-02), and a unit can't come back in the minutes before the purge (FR-01.17). A unit the purge already removed is `not_found`: "This is no longer in Trash."

## Risks / Trade-offs

- **[The app may show a unit whose expiry passed a moment ago]** → Recovering it now fails with the reason, and the next purge removes it.

## Migration Plan

None.
