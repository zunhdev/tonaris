# Design

## Context

Tonaris's authorization server is Better Auth's `@better-auth/mcp` 1.7.12, the OAuth provider configured for MCP (TS-61). AI clients are discovered by CIMD or registered by DCR, consent on Tonaris's page, and get JWT access tokens bound to `/mcp`. `/v1` refuses every bearer token (TS-102). The `/auth` endpoints are an allowlist (`apps/api/src/auth/plugin.ts`).

Fider's custom OAuth provider is a plain OAuth 2.0 client, read in its source at commit `9949e70` (26 October 2026):
- it sends `client_id`, `scope`, `redirect_uri`, `response_type` and `state`, without PKCE;
- it exchanges the code with its secret, Basic first;
- it reads a profile URL with the access token, taking ID, name and email by JSON paths.

On Fider Cloud, its callback is `https://login.fider.io/oauth/{key}/callback`, where Fider makes up the key when the provider is saved. Its sign-in route `/oauth/{key}?redirect=/` on the board starts the flow.

## Decisions

### 1. A first-party client written at start-up

Better Auth generates client IDs and secrets itself and has no static client list. The board's client is therefore a row the API writes at start-up from its settings (`syncFeedbackClient`): the fixed ID `feedback-board`, with the secret stored as Better Auth's hash (SHA-256, base64url).

- The callback URL comes from Fider, and the secret is one the creator generates and pastes into both places. Changing either takes effect at the next start.
- Removing both disables the row, so its sign-ins and tokens stop.
- One setting without the other fails start-up rather than switching the board off silently.

The row is confidential (`client_secret_basic`), uses the authorization code only, has `skipConsent` and `requirePKCE: false`, and has Fider's callback as its one redirect. Registration can't produce such a client: Better Auth's DCR ignores `require_pkce` and `skip_consent`, so this stays the only one.

### 2. The identity scopes, the board's alone

The server's `scopes` gain `openid` and `email`. To keep AI clients as they were:
- `clientRegistrationDefaultScopes` is MCP's three scopes. Registered and CIMD clients persist those, and asking for more is `invalid_scope`.
- `advertisedMetadata.scopes_supported` is MCP's three scopes, so clients that request what discovery lists don't start asking for `openid`.

The board asks for `openid email`, not `profile`. Better Auth's `profile` claims split `name` into given and family names, which fails for a person without a display name.

### 3. Userinfo for the board only

`GET /auth/oauth2/userinfo` joins the allowlist. Better Auth requires `openid` there, which only the board can be granted. `customUserInfoClaims` also throws for any other client, and sets `name`:
- the display name;
- or "Tonaris member", because Fider otherwise names a person after the start of their email.

`sub` is the account ID, which Fider keys its user on.

### 4. Nothing else opens

The board's tokens are opaque and bound to no resource:
- `/mcp` verifies a JWT with audience `/mcp` and a grant, so it refuses them.
- `/v1` refuses all bearer tokens.

With `skipConsent`, Better Auth records no consent, and connections are consents, so Settings doesn't list the board.

### 5. The link in the web app

The web server reads `FEEDBACK_URL`, the board's address, and `FEEDBACK_CALLBACK_URL`, which carries the provider key. `feedbackSignInUrl` builds `{board}/oauth/{key}?redirect=%2F`, and the root route renders it into a meta tag, as with Sentry's key. With either setting missing, there's no item.

Opening it is a new tab (`noopener`), so the CSP is untouched. If the person isn't signed in to Tonaris, the authorization request sends them to `/sign-in`, which continues the request as it does for AI clients.

## Risks / Trade-offs

- **Fider Cloud's hosting region and DPA aren't published.** The privacy notice names Fider without a region until the creator hears from Fider.
- **Fider keeps a person's name and email as they were at their first sign-in.** Later changes in Tonaris don't reach the board.
- **Deleting a Tonaris account doesn't remove board posts.** The notice says so, and Fider's settings delete them.
- **The free plan caps posts at 250.** Pro ($25 a month) lifts the cap and adds moderation.
