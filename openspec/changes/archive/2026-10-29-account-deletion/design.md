# Design

## Context

- **What references `user.id`:**
  - owned rows reference it with `NO ACTION` (TS-11): `containers`, `albums`, `memberships`, `album_service_links`, `trash_units`, `field_definitions`, `view_prefs`, `account_settings`, `positions`, `account_sync`, `change_log`, `mutations`, `approvals`, and `share_grants.grantee_id`, `saved_references.viewer_id`;
  - sessions, Better Auth accounts, OAuth rows, `email_changes` and `email_recoveries` cascade;
  - `admission_invitations.created_by` is the creator's.
- **Cascades below the user:**
  - containers cascade to their memberships, share links, share grants and saved references;
  - albums cascade to their memberships, provenance, service links and field values;
  - field definitions cascade to their options and values.
- **Trash units** are referenced by the containers and albums in them, without a cascade.
- **Viewers** re-read an owner's shares when the hub notifies the owner's account (`hub.notify`, TON-70). Access resolution reads only accepted grants and live links.
- **The job queue** (TS-90) runs handlers with retries, then buries.

## Goals / Non-Goals

**Goals:** the danger zone and dialog, the confirm transaction, the chunked deletion with progress and retry, and AC-40's checks.

**Non-Goals:**
- the export block (TON-89);
- revocation-ledger appends (M11-06, TS-113);
- deleting the creator.

## Decisions

### 1. Confirming: one transaction

`beginAccountDeletion(db, { userId, deletionId, tokenHash })`, in this order:
1. **Lock the user.** A missing account is refused; so is the creator. An account already deleting answers that.
2. **Free the address:** set `deleting_at`, and change `email` to the placeholder `{userId}@deleted.invalid`, under the reserved `.invalid` top-level domain. The real address then signs in to nothing at once, sign-in sends its "no account" email, and the address can be invited again. No sign-in hook is needed.
3. **End access:** delete the account's sessions, OAuth consents and tokens.
4. **End sharing:**
   - set `revoked_at` on its live links;
   - revoke the pending and accepted grants on its containers;
   - withdraw its own pending and accepted grants as a viewer.
5. **Record:** insert `audit_log` (`account.delete`, details `{}`), so no address stays behind.
6. **Track:** insert `account_deletions` with `id`, `user_id` (no foreign key), `token_hash` (unique), `status = deleting`, and `finished_at`.
7. **Queue:** enqueue the `account-deletion` job with `{ deletionId, userId }` on the same transaction.

After the commit, the route wakes the worker and notifies the hub for the account, so viewers and guests re-read and find nothing.

**Alternative considered:** a sign-in hook that refuses accounts being deleted. The placeholder makes sign-in find nothing with no special case.

### 2. The job: chunks, then the rest

`deleteAccountData(db, userId)`:
- **Albums** go in chunks of 500, each a transaction of its own, with their cascades.
- **Then one transaction:**
  1. memberships;
  2. containers (one statement, since `parent_id` has no foreign key), with their cascades;
  3. trash units;
  4. field definitions, with their options and values;
  5. the account's grants as a viewer, and its saved references;
  6. view preferences, account settings and positions;
  7. approvals, mutations, the change log and the sync row;
  8. the user row, which cascades the rest.
- **Idempotent:** a retry after a crash deletes whatever is left.

The handler marks the deletion `deleted` with `finished_at` and notifies the hub again. Errors retry after 5 s, 30 s and 2 min, then bury, which marks it `failed`.

A daily `prune-account-deletions` removes finished rows after 7 days.

### 3. Routes

| Route | Does |
| --- | --- |
| `POST /v1/account/deletion {email}` | session, an `account` write; answers `{ token }`, the progress token, which is stored as SHA-256 |
| `POST /auth/account-deletion/progress {token}` | public; answers `{ status }`, or 404 |
| `POST /auth/account-deletion/retry {token}` | public; a failed deletion goes back to `deleting` and is queued again; answers `{ status }` |

- **The confirm route refuses (422 with a sentence)** a typed email whose key doesn't match, and the creator.
- **Progress and retry are public:** the session is gone once deletion starts, so the random token, which only that browser holds, is what lets it follow its own deletion.

### 4. The page

- **The Danger zone** is the last section of Settings → Account. **Delete account** (danger) opens the dialog. The creator sees a note instead of the button.
- **The dialog:**
  - title "Delete your account?";
  - the consequences as a list;
  - a "Type {email} to confirm" field;
  - **Delete account permanently**, enabled once the field's email key matches;
  - **Cancel**.
- **Confirming:**
  1. the dialog keeps the token in `sessionStorage`;
  2. it clears the sync client's local data and the cached account;
  3. it goes to `/account-deleted`, outside the workspace, so the workspace never sends the browser to sign-in mid-way.
- **`/account-deleted`:**
  - it polls progress every second: "Deleting your account…" with an indeterminate bar, then "Your account has been deleted";
  - a failure shows "Couldn't finish deleting your account. Try again." with **Retry**;
  - without a token, it says "Your account has been deleted", with no claim about progress.

### 5. Members during deletion

`listMembers` leaves out accounts with `deleting_at`, so the creator never sees a placeholder address.

## Risks / Trade-offs

- **[No ledger event yet]:** a restore before M11-06 could revive a deleted account. TS-113's ledger, built by M11-06, covers every deletion-class event at once.
- **[A large change log]:** it is deleted in one statement. It is pruned to 30 days (TS-22), so that stays small.
- **[The creator can't delete themselves]:** deleting the creator would leave admissions without an owner. Changing creators needs a bootstrap of its own, outside this issue.

## Migration Plan

One migration adds `user.deleting_at`, `account_deletions`, and `account.delete` to the audit action check.
