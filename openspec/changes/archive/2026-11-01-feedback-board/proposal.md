# Proposal

Linear: TON-144 (Feature). Implements FR-11.15 and FR-11.14. Design: DS-31, DS-110, DS-119. Tech: TS-61, TS-105, TS-134. Done when a signed-in member opens the board from the account menu, arrives signed in, and can post and vote. Tests must show that the board's tokens reach neither `/mcp` nor `/v1`. The privacy notice names Fider, and the PRD, DS and TS are as built.

## Why

In manual testing on 31 October 2026, the creator asked for a way to send feedback and feature requests from inside Tonaris, to a friendly public place where requests can be seen, discussed and voted on. The TON-132 spike ([report](../../../docs/spikes/2026-11-01-feedback-board.md)) compared the trackers. On 1 November 2026 the creator chose:
- Fider Cloud's free plan at `feedback.tonaris.app`, with "Sign in with Tonaris";
- the board receives each person's name and email, so Fider can tell them about replies and status changes;
- requests reach Linear by hand.

Fider takes a custom OAuth provider, and Tonaris already runs an authorization server for MCP (TS-61). So the board needs no script in Tonaris and no CSP change. The work is to let one first-party client in without opening anything to AI clients.

## What Changes

- **The board's client:** `feedback-board`, a confidential client the API writes at start-up from `FEEDBACK_CALLBACK_URL` and `FEEDBACK_CLIENT_SECRET`. It skips consent and works without PKCE, since Fider sends no verifier. Without the settings, it is disabled; with only one of them, the API refuses to start.
- **Identity scopes for it alone:** the authorization server gains `openid` and `email`. Registered and discovered clients still get MCP's scopes only, and discovery still advertises only those.
- **Userinfo:** `GET /auth/oauth2/userinfo` is served, for the board's tokens only. It answers with the ID, the email, and the display name, or "Tonaris member", never the start of the email.
- **Its tokens open nothing else:** `/mcp` and `/v1` refuse them. Skipping consent records no grant, so the board isn't a connection in Settings.
- **The account menu:** **Feedback and ideas** opens the board in a new tab through Fider's sign-in route for Tonaris's provider, on desktop and phone. It shows only when the web app has `FEEDBACK_URL` and `FEEDBACK_CALLBACK_URL`.
- **The privacy notice** gains "The feedback board": Fider receives the display name and email of someone who signs in, shows their posts with their name, and keeps them when the Tonaris account is deleted. This is a new terms version, `2026-11-02`, so members agree once more (TS-134).
- **The deploy guide** gets the setup: the Fider site, its domain, the provider form and the Render settings.

## Capabilities

### New Capabilities

- `feedback-board`: the menu item, Sign in with Tonaris, what the board receives, and the board's client's limits.

### Modified Capabilities

- `mcp-access`: the PKCE-only rule is for AI clients; the board's client is Tonaris's own.
- `terms-and-privacy`: the privacy notice describes the feedback board.

## Impact

- **`packages/domain`:**
  - `feedbackProviderKey` and `feedbackSignInUrl`;
  - the terms version.
- **`packages/db`:** `saveFirstPartyClient` and `disableFirstPartyClient`.
- **`apps/api`:**
  - the `feedback` setting;
  - `syncFeedbackClient` at start-up;
  - the scopes, registration defaults and advertised scopes;
  - the userinfo claims;
  - the `/auth` allowlist.
- **`apps/web`:**
  - the `feedbackUrl` setting and its meta tag;
  - the menu item;
  - the privacy notice.
- **Deploy:** `render.yaml`, `.env.example` and `docs/deploy.md`.
- **Docs:** PRD FR-11.15, DS-31, DS-110, DS-119, TS-61, TS-105 and TS-134, as built.
