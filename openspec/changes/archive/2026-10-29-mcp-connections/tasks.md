# Tasks

## 1. Last used

- [x] 1.1 Add `oauth_consent.last_used_at` and its migration, and `recordConnectionUse()` (design decisions 1 and 2). `/mcp` records each call, and `GET /v1/connections` returns `lastUsedAt`. Verify with an API test: it is null before the first call, set after it, and unchanged by a second call within the minute.
- [x] 1.2 Show "Last used …" or "Not used yet" in Settings → Connections, with the note on changing a mode. Verify with Playwright, extending `connections.e2e.ts`: after the client's call, its row says "Last used".

## 2. Consent

- [x] 2.1 Show the client's domain for CIMD clients (design decision 3). Verify with a unit test of `consentRequest` for Codex's document and loopback callback.

## 3. Spec coverage of what G3 built

- [x] 3.1 Confirm that the existing tests cover each `mcp-access` scenario:
  - `mcp.test.ts`: discovery, CIMD and DCR, the DCR limit, consent in each mode, the 2025 fallback, both modes' tools, the audience checks, revocation, re-consent narrowing;
  - `connections.e2e.ts`: sign-in, consent and Revoke in the browser.

## 4. Docs

- [x] 4.1 Record TS-61's DCR limit as decided and last use as built, and DS-85 and DS-86 as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
- TON-85's live session connects each client in both modes.
