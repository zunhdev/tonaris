# Design

## Context

- **What TON-24 built:**
  - `admission_invitations` stores `email_key`, `token_hash`, `status`, `expires_at` and `email_status`. A partial unique index keeps one available invitation per address.
  - `service_state.admissions_paused` is the pause switch.
  - The join is one transaction (`admitAccount`) that locks the pause row for share and the invitation for update.
  - `revokeAdmissionInvitation` and `setAdmissionsPaused` exist without callers.
  - Tests issue invitations directly with `issueAdmissionInvitation`.
- **Tokens are stored only hashed** (TS-71), so an email can't be sent again with the same link.
- **What TON-73 built:** the email outbox records an invitation's delivery through `{ outcome: { kind: "admission_invitation", id } }`, as sent, failed or unknown, while `email_status` is `sending`.
- **Authorization:** `authorizeAdmissionAdmin(principal)` in `packages/domain/src/policies.ts` already allows the creator only, and never MCP.
- **Connections** (Settings → Connections) is the model for an app-only admin surface: REST routes under `/v1` behind the session guard, and a page that loads them.

## Goals / Non-Goals

**Goals:** the admin's routes and page, re-issuing for expired addresses, resend with a new link, the daily expiry job, and AC-02's checks.

**Non-Goals:**
- the `/join/:token` landing page and registration UI (TON-75), which the invitation email links to;
- the member list and creator-assisted recovery on a member's row (TON-78);
- tabs in Admin. There is one section until TON-78 adds members.

## Decisions

### 1. REST routes, not sync mutations

Admission state belongs to no one's collection, so it isn't part of sync, and it is app-only. The routes sit under `/v1/admin/admissions`, behind the session guard, and every handler first asks `authorizeAdmissionAdmin`:

| Route | Does |
| --- | --- |
| `GET /v1/admin/admissions` | `{ paused, invitations }`, newest first |
| `POST /v1/admin/admissions/invitations {email}` | issues and emails one; 201 with the invitation |
| `POST /v1/admin/admissions/invitations/:id/resend` | a new link, emailed; 200 with the invitation |
| `POST /v1/admin/admissions/invitations/:id/revoke` | 200 with the invitation |
| `PUT /v1/admin/admissions/paused {paused}` | 200 `{ paused }` |

- **Each invitation** is `{ id, email, status, createdAt, expiresAt, redeemedAt, emailStatus }`. The status is the one that holds now (`invitationStatus`), so an unrecorded expiry already shows as expired.
- **Refusals:**
  - a non-creator gets 403 `permission_denied`, and MCP tokens never reach `/v1` (TS-62);
  - an unknown ID is 404 `not_found`;
  - a registered address, an already-invited address, or an invitation that isn't available is 422 `validation_failed`, with a sentence from `packages/domain` in `detail`.

  No new error code is needed.
- **Alternative considered:** domain commands through `/v1/sync`. That would put admission in the command registry that MCP shares, only to exclude it again, and in the change log of an account it doesn't belong to.

### 2. Issuing is one transaction

1. If an account has the address's email key, refuse as `registered`.
2. Mark this address's available row that is past its expiry as `expired`. This frees the partial unique index, and settles TS-71's "renew or mark first": the old row stays as history.
3. Insert the new row with `email_status = 'sending'`, doing nothing on a conflict. If nothing was inserted, another available invitation holds the index, so refuse as `invited`.

Two concurrent invitations for one address can't both insert. The loser is refused as `invited`.

After the commit, the email is queued with the invitation's outcome. If queueing itself fails, the invitation is recorded as `failed`, so its row offers Resend instead of showing "sending" for good.

### 3. Resend rotates the token

One conditional update sets a new `token_hash` and `email_status = 'sending'`, where the invitation is available and unexpired. Then the new link is emailed. The earlier link stops working, and the expiry stays.

The API accepts any available invitation. The page offers Resend only for failed or unconfirmed email, like the sharing dialog (DS-65), because an earlier email may still be in flight otherwise.

**Alternative considered:** storing the token encrypted so the same link could be sent again. Rejected, because TS-71 keeps tokens only as hashes, as share links are.

### 4. Revoke only what's available

The update is conditional on `status = 'available'` and an unexpired `expires_at`. If it updates nothing, an existing invitation is refused with `detail`, and an unknown ID is `not_found`. A redeemed invitation can't be revoked, so admitted accounts are never touched.

### 5. Pause

`setAdmissionsPaused` already waits for admissions in flight, since they lock the row for share. It neither touches invitations nor sessions.

### 6. The daily expiry job

`expire-admission-invitations` (TS-91), daily, marks available invitations past `expires_at` as `expired`. Expiry is still checked on use and in the list, so the job only records it.

### 7. The page

- **Route:** `/admin/admissions`, under the `_workspace` layout, so it has the shell and the session. Its `beforeLoad` throws `notFound()` unless the account's role is `creator`. Its loader calls `GET /v1/admin/admissions`.
- **Account menu:** Admin (creator only), between Settings and Keyboard shortcuts, as DS-31 orders it.
- **Layout, top to bottom:**
  - the header switch with its status text, and the pausing note while paused;
  - the invite form, whose refusals show the server's `detail`;
  - the table, which scrolls sideways inside its frame on narrow windows. It is a desktop page (FR-11.6) that still doesn't break the layout.
- **Refreshing:** while any row's email is sending, the page reloads every 2 seconds, so sent, failed or not confirmed shows up without a manual refresh.

### 8. The invitation link

`invitationLink(webOrigin, token)` is `${webOrigin}/join/${token}`, beside `joinLink`, which adds the code fragment.

## Risks / Trade-offs

- **[The `/join/:token` page arrives with TON-75]:** until then, an invitation's link opens the not-found page. M8 ships both before any deploy, and AC-02's checks use the API.
- **[A late outcome from an earlier send]:** the outbox records only while `email_status` is `sending`. A job still retrying when a resend set `sending` again could record its outcome on the new send. The page offers Resend only once the earlier send has finished, as failed or unconfirmed.
- **[Pausing in parallel e2e tests]:** pausing is service-wide. The admin e2e test resumes before it ends. No other e2e test joins yet; TON-75's must not run while this one has admissions paused, so the pause check stays short and in one test.

## Migration Plan

No schema change. The daily job starts with the next deploy.
