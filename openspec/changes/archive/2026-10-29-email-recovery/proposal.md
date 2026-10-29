# Proposal

Linear: TON-78 (Feature). Implements FR-11.5. Design: DS-93, DS-100. Tech: TS-73. Done when AC-39's recovery part passes and the admin sees no collection data.

## Why

A member who loses access to their email can't sign in, and TON-77's change needs the current address. FR-11.5 has the creator move such an account to a new address once ownership is established. The creator judges ownership outside the app (TS-73).

## What Changes

- **`/help/recovery`** (DS-93): a public page explaining creator-assisted recovery, with the support address from the new `SUPPORT_EMAIL` setting.
  - It is linked as "Lost access to your email?" from sign-in and from Settings → Account.
  - `GET /v1/support` answers the address.
- **Admin → Members** (`/admin/members`, DS-100), beside Admissions, with tabs between them:
  - **The list** shows each account's email, display name and join date, and never collection data.
  - **Recover sign-in email** on a row takes a new address, a reason, and "Also disconnect AI connections" (off by default). Tonaris emails a code and a link to the new address, and the row shows "Waiting for verification" until it completes or the creator cancels it.
- **`/recover/:token`:** the link's page, which confirms with the code. Confirming swaps in one transaction:
  - it changes the email, refusing if another account has the new key (FR-11.5);
  - it ends all the account's sessions;
  - it disconnects AI connections if asked;
  - it writes `audit_log` (`email.recover`) with the creator, the reason, and the old and new keys.

  The old address then signs in to nothing, and the same account keeps its data. Deleted accounts can't be recovered, since nothing is left to move.
- **The swap is shared** with TON-77's email change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: creator-assisted recovery and its help page (FR-11.5).
- `admission`: Admin's member list, without collection data (FR-11.6).

## Impact

- **`packages/db`:**
  - the `email_recoveries` table and the `email.recover` audit action (a migration);
  - the recovery's storage;
  - the shared swap.
- **`apps/api`:**
  - `SUPPORT_EMAIL`, required in production;
  - `GET /v1/support`, and the admin's member and recovery routes, additive in OpenAPI;
  - `POST /auth/recovery/confirm`, hidden like the other `/auth/*` routes.
- **`apps/web`:**
  - `/help/recovery`, `/recover/$token` and `/admin/members`;
  - the Admin tabs;
  - the two links.
- **Docs:** DS-93, DS-100, TS-73, TS-105 and the deploy guide.
