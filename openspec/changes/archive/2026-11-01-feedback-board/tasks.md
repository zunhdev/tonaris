# Tasks

## 1. Domain and database

- [x] 1.1 Domain: `feedbackProviderKey` and `feedbackSignInUrl`; the new `termsVersion`
- [x] 1.2 Database: `saveFirstPartyClient` and `disableFirstPartyClient`

## 2. API

- [x] 2.1 The `feedback` setting from `FEEDBACK_CALLBACK_URL` and `FEEDBACK_CLIENT_SECRET`: both or neither, a Fider callback URL, a secret of at least 32 characters
- [x] 2.2 `syncFeedbackClient` at start-up and in the test app
- [x] 2.3 The authorization server: identity scopes, MCP's scopes for registered and discovered clients and in discovery, the userinfo claims
- [x] 2.4 `GET /auth/oauth2/userinfo` in the `/auth` allowlist

## 3. Web

- [x] 3.1 `feedbackUrl` from `FEEDBACK_URL` and `FEEDBACK_CALLBACK_URL`, rendered into a meta tag
- [x] 3.2 **Feedback and ideas** in the account menu, on desktop and phone
- [x] 3.3 The privacy notice's "The feedback board"

## 4. Tests, docs and checks

- [x] 4.1 API tests: sign-in without consent or PKCE, userinfo's claims and fallback name, signed-out sign-in, tokens refused by `/mcp` and `/v1`, no connection, a wrong secret, extra scopes, a foreign redirect, the disabled client, AI clients refused the identity scopes and userinfo, discovery's scopes; configuration tests
- [x] 4.2 Browser test: the menu item opens the board's sign-in route in a new tab; the privacy notice names Fider
- [x] 4.3 `render.yaml`, `.env.example`, and the deploy guide's feedback board section
- [x] 4.4 PRD FR-11.15, DS-31, DS-110, DS-119, TS-61, TS-105 and TS-134 as built
- [x] 4.5 Run `bun run check`
