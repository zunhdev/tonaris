# Proposal

Linear: TON-79 (Feature). Implements FR-11.10 and FR-11.11; FR-08.7's export offer comes with TON-89. Design: DS-97. Tech: TS-74. Done when AC-40 passes, its export offer excepted.

## Why

A member can't leave Tonaris: their account and collection stay forever. FR-11.10 and FR-11.11 let them delete the account permanently, after a full warning. Access, sharing and AI connections must stop at once, and every owned row must go.

On 29 October 2026 the creator decided to build deletion now, without "Download your data first". TON-89 (M10) adds the export states to this dialog.

## What Changes

- **Settings → Account → Danger zone** (DS-97): **Delete account** opens a full-height dialog that lists the consequences (FR-11.10). Confirming needs the sign-in email typed (paste allowed) and **Delete account permanently**.
- **Confirming is one transaction** (TS-74):
  - the account is marked deleting, and its sign-in key moves to a placeholder, so the address signs in to nothing at once;
  - its sessions and AI connections end;
  - its share links are revoked, and its invitations revoked or withdrawn, so its shared content is unavailable to every viewer and guest at once;
  - the audit log records `account.delete`;
  - a deletion job is queued.
- **The job** deletes the owned data in chunks (albums first, then everything else) and the user row last. Its progress is `deleting`, `deleted` or `failed`. A failed deletion can be retried.
- **The page** moves to `/account-deleted`: "Deleting your account…", then "Your account has been deleted". A failure says so, with **Retry**, and claims no partial success.
- **The creator's own account** can't be deleted. It runs admissions and is the only one with the role (TS-71).
- **Not in this change:**
  - "Download your data first" (TON-89);
  - TS-113's revocation-ledger events, which M11-06 builds for every deletion-class event, since none is recorded yet.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: deleting an account (FR-11.10, FR-11.11).

## Impact

- **`packages/db`:**
  - `user.deleting_at`, the `account_deletions` table and the `account.delete` audit action (a migration);
  - the confirm transaction and the chunked delete.
- **`apps/api`:**
  - `POST /v1/account/deletion` (additive in OpenAPI);
  - `POST /auth/account-deletion/progress` and `…/retry`, hidden;
  - the deletion job and a daily prune of finished deletions;
  - the member list leaves out accounts being deleted.
- **`apps/web`:** the Danger zone, its dialog, and `/account-deleted`.
- **Docs:** DS-97, TS-74 and TS-11.
