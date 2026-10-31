# Tasks

## 1. Domain and database

- [x] 1.1 Domain: `passkeySchema` and `passkeyRenameSchema`; the `passkey-added` email; the `passkey.removed` ledger event; the new `termsVersion`
- [x] 1.2 Database: the `passkey` table with a migration; `listPasskeys`, `renamePasskey`, `removePasskey` (recording `passkey.removed`)
- [x] 1.3 Database: `endAccountAccess` and `confirmEmailRecovery` remove passkeys, recovery recording `passkey.removed`; the ledger replay applies it

## 2. API

- [x] 2.1 `@better-auth/passkey` 1.7.12: RP ID and origin from the web origin, discoverable and user-verified passkeys, refusals without UV, names from the AAGUID; the model in Drizzle's schema and the in-memory store
- [x] 2.2 Hooks: `createSession` dropped from registrations; the `passkey-added` notice after one
- [x] 2.3 The `/auth` allowlist's four ceremony endpoints; passkey starts and sign-ins count as sign-in steps per IP
- [x] 2.4 `/v1/account/passkeys`: list, rename, remove; the OpenAPI document

## 3. Web

- [x] 3.1 `@simplewebauthn/browser`; the auth client's passkey calls and their messages
- [x] 3.2 `/sign-in`: **Sign in with a passkey** and the email field's autofill
- [x] 3.3 Settings → Account: the Passkeys section, with add, rename, remove, and the code that confirms an older session
- [x] 3.4 The privacy notice's passkey lines and cookie

## 4. Tests, docs and checks

- [x] 4.1 API tests with a software authenticator: adding (fresh session, UV, notice, duplicates excluded), signing in (UV, unknown passkey, one-time challenge, another origin), limits, unexposed endpoints, the `/v1` routes, recovery and deletion
- [x] 4.2 Database tests: deletion, recovery and the replay remove passkeys, a removal is recorded, and an email change keeps them
- [x] 4.3 Browser test (Chromium's virtual authenticator): add a passkey in Settings, get the notice, rename it, sign in through autofill and the button, remove it
- [x] 4.4 PRD FR-11, DS-90, DS-93, TS-70, TS-73, TS-74, TS-104, TS-113 and TS-134 as built
- [x] 4.5 Run `bun run check`
