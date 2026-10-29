# Proposal

Linear: TON-80 (Feature). Implements FR-10.1, FR-10.2, FR-10.3 and the connection side of X-03. Design: DS-85, DS-86. Tech: TS-60, TS-61, TS-62. Done when all three clients connect in either mode and revoking cuts access at once.

## Why

The G3 spikes (TON-22, TON-23) built the MCP endpoint, Better Auth's authorization server, the consent page and a minimal Settings → Connections, production-shaped, and verified them in Claude web, ChatGPT web and Codex. They left three things for M9:

- Settings doesn't say when a connection was last used (DS-86).
- The DCR limit was a proposal, which the creator approved on 29 October 2026: 10 registrations per IP an hour.
- The consent page names the redirect host but not the client's domain (DS-85).

Nothing in `openspec/specs` describes MCP access yet, since the spikes were chores. This change records it as the `mcp-access` capability, which the rest of M9 extends.

## What Changes

- **Last used** (DS-86):
  - Tonaris's own `last_used_at` column on Better Auth's consent records each MCP call, at most once a minute.
  - `GET /v1/connections` gains `lastUsedAt`, a response field only.
  - Settings shows "Last used …" or "Not used yet", and says that changing a mode means revoking and connecting again.
- **The consent page** (DS-85) shows the client's domain: the host of its metadata document's URL, for a client registered by CIMD. The redirect host follows only when it differs, as for Codex's loopback callback.
- **The DCR limit** of 10 registrations per IP an hour, already built, is recorded as decided (TS-61).
- **The `mcp-access` spec** records:
  - the server and its discovery;
  - registration by CIMD with DCR as the fallback;
  - consent in either mode, with the mode enforced;
  - revocation;
  - app-only connection management;
  - token audiences.

## Capabilities

### New Capabilities

- `mcp-access`: AI clients connect to the collection through one MCP server, in a mode the person chooses, and lose access the moment it is revoked.

### Modified Capabilities

None.

## Impact

- **`packages/db`:** the `last_used_at` column and its migration, and `recordConnectionUse()`.
- **`packages/domain`:** `connectionSchema` gains `lastUsedAt`.
- **`apps/api`:** `/mcp` records use, and `GET /v1/connections` returns it. OpenAPI gains a response field, which isn't a breaking change.
- **`apps/web`:** the consent page's domain line, and Settings → Connections' details and note.
- **Docs:** TS-61's DCR limit decided, and last use as built; DS-85 and DS-86 as built.
