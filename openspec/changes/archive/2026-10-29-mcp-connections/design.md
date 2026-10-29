# Design

## Context

- **A connection is Better Auth's consent:** one row per person and client in `oauth_consent`. Its scopes carry the mode (`mcpModeOf`). Revoking deletes it with the client's tokens (TON-22).
- **Every MCP call already reads the connection** behind its token (`findConnection`), so a revoked connection fails on the next call, and the mode is what both the token and the connection grant (TS-62).
- **Better Auth owns the table's columns,** and its Drizzle adapter writes only the fields it knows.

## Goals / Non-Goals

**Goals:**
- last use in Settings;
- the client's domain on the consent page;
- the DCR limit recorded as decided;
- the `mcp-access` spec for what the spikes built.

**Non-Goals:**
- the "Waiting for your approval" list in Settings (TON-83);
- per-client setup steps (TON-86);
- per-grant rate limits (TON-85);
- live runs in the three clients, which TON-85's TS-123 session covers in both modes.

## Decisions

### 1. A column of our own on the consent

`oauth_consent.last_used_at`, nullable, is written only by Tonaris.
- A separate table would need its own cascade and a join for nothing: the row is already read on every call.
- Better Auth never writes the column, so re-consenting keeps it.

### 2. Written at most once a minute

The route already holds the connection when it checks a token. `recordConnectionUse()` skips the write when the stored time is under a minute old (`connectionUseInterval`), so a burst of agent calls costs one `UPDATE` by primary key. The write is awaited: a write left running can outlive a test's schema (TON-22 finding 14). Settings shows the time to the minute, so finer precision buys nothing.

### 3. The client's domain

For a CIMD client, its ID is the URL its metadata was fetched from, so that URL's host is the client's verified domain:
- `claude.ai` for Claude;
- `chatgpt.com` for ChatGPT and Codex.

The page shows "From {domain}". It adds "Returns to {redirect host}" only when that differs, such as Codex's `127.0.0.1:<port>`. A DCR client's ID is random, so its page keeps showing only the redirect host.

## Risks / Trade-offs

- **[Last use lags up to a minute]** → Settings shows minutes, and a connection's activity is what matters, not the second.
- **[An extra write per minute per active connection]** → It's one indexed `UPDATE`, negligible at this scale.

## Migration Plan

One additive migration: `ALTER TABLE oauth_consent ADD COLUMN last_used_at`. Existing connections show "Not used yet" until their next call.
