# Design

## Context

Sign-in is Better Auth's `emailOTP` plugin behind an allowlist of `/auth` endpoints (`apps/api/src/auth/plugin.ts`) and Tonaris's own limiter (`sign-in-limits.ts`). The API runs on `api.tonaris.<tld>` and the web app on the apex. The session cookie is scoped to the parent domain (TS-08). Account changes that end access run in transactions in `packages/db`:
- `endAccountAccess` for deletion and its ledger replay;
- `confirmEmailRecovery` for recovery;
- `swapSignInEmail`, shared by recovery and the email change.

Deletion blocks sign-in today by moving the email to a placeholder. `@better-auth/passkey` 1.7.12 matches the pinned Better Auth. It does the WebAuthn ceremonies with SimpleWebAuthn 13, and keeps each challenge in `verification` behind a signed 5-minute cookie.

## Decisions

### 1. The relying party is the web host

The plugin defaults its RP ID to the base URL's host, which is the API's. Browsers create passkeys on the web origin, and the RP ID must be that host or a parent of it. So `rpID` is `new URL(config.webOrigin).hostname` (`tonaris.<tld>`, `localhost` locally), `origin` is `config.webOrigin`, and `rpName` is "Tonaris". Because the origin is fixed, a request from anywhere else fails verification, whatever its `Origin` header says.

### 2. The person is verified, always

The plugin verifies with `requireUserVerification: false`, and its sign-in options ask for verification only as "preferred". A passkey replaces an emailed code, so it has to prove the person, not just a touch:
- **Registration:** `authenticatorSelection` asks for `residentKey: "required"` and `userVerification: "required"`, so the passkey is discoverable and the browser asks for a PIN, fingerprint or face. `registration.afterVerification` refuses a response without the UV flag, with the code `USER_VERIFICATION_REQUIRED`.
- **Sign-in:** `authentication.afterVerification` refuses such a response the same way, before the counter moves or a session starts.

The same hook names the passkey: `getAuthenticatorName(aaguid)`, else "Passkey". Apple's passkeys report a zero AAGUID, so they get "Passkey" and can be renamed.

### 3. Four ceremony endpoints, management through /v1

The allowlist gains `GET /auth/passkey/generate-register-options`, `POST /auth/passkey/verify-registration`, `GET /auth/passkey/generate-authenticate-options` and `POST /auth/passkey/verify-authentication`.

The plugin's `list-user-passkeys`, `update-passkey` and `delete-passkey` stay `not_found`. Instead, `/v1/account/passkeys` lists, renames and removes, as the email change does: session only, authorized as `account` writes, so app-only.

A removal there runs in a transaction that also records the ledger event, which Better Auth's endpoint couldn't do. The `before` hook drops `createSession` from a registration body, since adding a passkey never needs a second session.

### 4. Limits

`generate-authenticate-options` is public and writes a challenge row, and the sign-in page asks for one on every visit for autofill. It counts as `codeSubmission(ip)`, as does `verify-authentication`. Both share the 20 steps per IP address per 15 minutes (TS-104, decided 31 October 2026). The registration endpoints need a fresh session and aren't limited.

### 5. A fresh session, confirmed with a code

The plugin's registration uses Better Auth's `freshSessionMiddleware`: a session created within `freshAge`, one day by default, which Tonaris keeps. Otherwise registration answers 403 `SESSION_NOT_FRESH`. Settings then emails a sign-in code to the account's address with the sign-in endpoints, so the same limits and rules apply. Signing in with the code starts a new session.

The person then chooses **Add a passkey** once more. Safari allows `navigator.credentials.create` only right after a user gesture, which an asynchronous code check would outlast. The old session stays valid until it expires, as any other session of the account does.

### 6. The notice

An `after` hook on `verify-registration` reads the created passkey from the response. It queues `passkey-added` `{ name }` to the session's user through the outbox (TS-72), in the background like the no-account email. The email has no lifetime, since it carries no code.

### 7. Storage

`passkey` follows Better Auth's model, with snake_case columns:
- `id` uuid;
- `user_id`, cascading;
- `name`, `public_key`;
- `credential_id`, unique;
- `counter`, `device_type`, `backed_up`, `transports`, `aaguid`;
- `created_at`, `updated_at`.

`user_id` is indexed. Only Better Auth writes rows; `/v1` renames and deletes them.

### 8. Ending access, and the ledger

`endAccountAccess` deletes the account's passkeys with its sessions. Its ledger replay already calls it, so a restored deletion removes them too.

`confirmEmailRecovery` deletes them in its transaction and records `passkey.removed` with `passkeyId: null`, meaning all of them. A member's removal records it with the passkey's ID. `swapSignInEmail` doesn't touch passkeys, so the email change keeps them. The ledger replay deletes the passkey, or all of the account's when the ID is null.

### 9. The web app

`@simplewebauthn/browser` is pinned at the version the plugin resolves, and the web app calls the endpoints with its own `fetch`, as for codes. On `/sign-in`:
- **Autofill:** when `browserSupportsWebAuthnAutofill()`, the page starts `startAuthentication({ optionsJSON, useBrowserAutofill: true })`, and the email field is `autocomplete="username webauthn"`.
- **The button:** **Sign in with a passkey** starts a modal ceremony, and SimpleWebAuthn's abort service cancels the autofill one first.
- **Success:** it lands as a code does: `forgetSignIn`, `forgetAccount`, then the safe redirect, so the AI-connection continuation works unchanged.
- **Cancelling:** a cancelled ceremony (`NotAllowedError`) says nothing.

Settings → Account adds a Passkeys section between the sign-in email and the Danger zone. It loads its list with the email change in the route's loader. Browsers without WebAuthn see the list, and a line saying this browser can't add passkeys.

### 10. The terms version

The privacy notice gains the passkey lines and the 5-minute cookie, so `termsVersion` moves to the date this merges (decided 31 October 2026). Members see the one-time screen again.

## Testing

- **API:** `bun test` signs passkeys with a software authenticator in `apps/api/src/auth/passkey-testing.ts`:
  - a P-256 key from WebCrypto;
  - `none` attestation;
  - a minimal CBOR encoder for the attestation object and the COSE key;
  - DER signatures.

  This exercises the real plugin end to end: the limits, UV refusal, endpoints that don't exist, the notice, the `/v1` routes, recovery and deletion, and the ledger replay.
- **Browser:** Chromium's virtual authenticator (CDP `WebAuthn`) adds a passkey in Settings, then signs in through the email field's autofill, which it answers by itself, and through the button, with autofill turned off. Firefox and WebKit have no virtual authenticator, so that test is Chromium-only.

## Risks

- **Conditional UI differs across browsers.** Where autofill isn't supported, the button still works.
- **Passkeys left on devices.** A passkey removed in Settings stays in the person's password manager. Using it gets "This passkey isn't on a Tonaris account anymore", and the person deletes it there.
