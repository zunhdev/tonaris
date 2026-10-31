# Proposal

Linear: TON-143 (Feature). Implements FR-11.1, FR-11.4, FR-11.5, FR-11.11, FR-11.13 and FR-11.14. Design: DS-90, DS-93. Tech: TS-70, TS-73, TS-74, TS-104, TS-113, TS-134. Done when a member adds a passkey in Settings → Account and signs in with it from `/sign-in`, including the AI-connection sign-in. Recovery and deletion must remove passkeys, and adding one must send a notice. It ships with tests, and the specs and privacy notice are updated as built.

## Why

The creator asked for passkeys (31 October 2026): a quicker way back in than waiting for an emailed code, on the phones and browsers members already use. Better Auth's passkey plugin, at the version Tonaris pins, does the WebAuthn ceremonies. The work is keeping Tonaris's guarantees:
- deletion and recovery cut off access;
- only planned endpoints are exposed;
- sign-in is limited;
- the privacy notice says what's kept.

## What Changes

- **Sign in with a passkey:** `/sign-in` gets **Sign in with a passkey** under **Continue**. The email field also offers saved passkeys in the browser's autofill. A passkey must check the person with a face, fingerprint or PIN; one that only checks for presence is refused. The person lands where the code would have taken them, the AI-connection flow included.
- **Passkeys in Settings → Account:** a Passkeys section lists them, newest first, each with its name and the day it was added. Members can add, rename and remove them there. Adding one needs a sign-in from the last day, so an older session first confirms with an emailed code. Each passkey is named after its password manager when that's known, and "Passkey" otherwise.
- **A notice:** adding a passkey emails the account's address, naming the passkey and pointing to Settings → Account (decided 31 October 2026).
- **Recovery removes passkeys** along with every session. **Email change keeps them** (both decided 31 October 2026). **Deletion removes them** at once, since a passkey signs in without the email. Removals are recorded in the revocation ledger, so a restored backup doesn't bring a passkey back.
- **Limits:** starting a passkey sign-in and finishing one count toward the 20 sign-in steps per IP address per 15 minutes (TS-104, decided 31 October 2026).
- **Endpoints:**
  - The `/auth` allowlist gains the plugin's four ceremony endpoints.
  - Listing, renaming and removing are `/v1/account/passkeys` routes. Account data still changes only through `/v1`, and nothing changes for MCP.
- **Privacy notice:** it says what a passkey stores and mentions the 5-minute cookie that the sign-in page and adding a passkey set. This is a new terms version, so members agree once more (decided 31 October 2026).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`:
  - signing in with a passkey;
  - managing passkeys in Settings → Account;
  - the notice;
  - what recovery, email change and deletion do to passkeys;
  - the limits;
  - the exposed endpoints.
- `terms-and-privacy`: the privacy notice describes passkeys.

## Impact

- **`packages/domain`:**
  - the passkey schemas;
  - the `passkey-added` email;
  - the `passkey.removed` ledger event;
  - the terms version.
- **`packages/db`:**
  - the `passkey` table and its migration;
  - list, rename and remove;
  - deletion, recovery and the ledger replay remove passkeys.
- **`apps/api`:**
  - `@better-auth/passkey` 1.7.12, set to the web origin and requiring user verification;
  - the `/auth` allowlist and limits;
  - the notice;
  - the `/v1/account/passkeys` routes and the OpenAPI document.
- **`apps/web`:**
  - `@simplewebauthn/browser`;
  - the sign-in button and autofill;
  - the Passkeys section with its confirmation step;
  - the privacy notice.
- **Docs:** PRD FR-11, DS-90, DS-93, and TS-70, TS-73, TS-74, TS-104, TS-113 and TS-134, as built.
