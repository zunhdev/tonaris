# Design

## Context

- **TON-65:** `share.invite` saves a pending grant with `email_status` null, and logs no change. `email_status` takes `sending`, `sent`, `failed` or `unknown` (TS-33).
- **Email** has no job queue yet (TS-90). Sign-in codes and admission's join codes are sent after the response through `EmailPort`, with failures logged (TS-72). Templates render in `packages/domain/src/email.ts`.
- **`mutationRunner`** in `apps/api/src/capture.ts` prepares context around `executeMutation` (link URLs, link hashes). `ExecutedMutation` says whether an outcome was replayed.
- **There is no live channel to another account's client:** streams carry one account's change log.

## Goals / Non-Goals

**Goals:** delivery with honest status, Resend, the recipient's inbox and email page, and accept and decline.

**Non-Goals:**
- the saved reference reaching clients, and Shared with me (TON-68);
- the owner revoking and the recipient leaving (TON-67);
- the job queue and the email provider (M8, TON-73).

## Decisions

### 1. Delivery

**Marking it for sending:**
- `share.invite` sets `email_status = 'sending'` on a new grant and reports `{grantId, status, emailing: true}`; an existing grant reports `emailing: false`.
- `share.resendInvitation {grantId}` sets `sending` on a pending grant of the owner's and reports `emailing: true`.

**Sending (`deliverInvitation()` in `apps/api/src/invitations.ts`):** after a confirmed, non-replayed outcome with `emailing`, the runner calls it in the background. It:
1. reads the grant with the recipient's current email, the owner's display name and the container;
2. renders `share-invitation`;
3. sends, racing a 30 s timeout;
4. records `sent`, `failed` or `unknown`, only while the grant is still pending and `sending`.

**After a crash:** a grant left `sending` for over 5 minutes reads as `unknown` in the owner's dialog, which offers Resend.

**Why not the queue:** it doesn't exist yet. This mirrors sign-in codes, and TON-73 moves both.

### 2. Accept and decline

- **Both** take `{grantId}` and are app-only. They run under the recipient's lock.
- **The checks:**
  - the grant must exist and be the principal's, else `not_found`, so other people's invitations aren't probed;
  - it must be pending with an active container, else `not_found` "This invitation is no longer available." An accepted grant answers `share.accept` as applied, changing nothing.
- **The write is conditional** on `status = 'pending'`, so a concurrent revoke (TON-67) wins cleanly.
- **Accepting** upserts `saved_references (viewer, container)`. A reference that already exists keeps its `link_id`; a new one has none. No change is logged until TON-68 brings references to clients.

### 3. Reads

- **`GET /v1/invitations`:** the principal's pending grants on active containers, oldest first:
  - `{id, owner: {displayName}, container: {id, name, kind}, invitedAt}`.
- **`GET /v1/invitations/{id}`** answers `{state, invitation?}`:
  - `pending` or `accepted` (with the invitation) when it's the principal's;
  - `wrong_account` when the grant is someone else's and still pending, with no details;
  - `unavailable` otherwise.

  Both need a session.
- **The dialog's `shareSettings()`** reports `sending` older than 5 minutes as `unknown`.

### 4. Web

- **Routes:** `/invitations` and `/invitations/$id`, under the workspace layout, so sign-in comes first and returns there.
- **The sidebar:** an Invitations item below Shared with me. Its count is polled from `GET /v1/invitations` on load, on window focus and every 60 s, and it's hidden at zero. The inbox and the page refresh it after a choice.
- **Accepting** then offers "It's in Shared with me" (TON-68 fills that view).
- **The dialog:** each pending row adds its delivery, with **Resend** for failed or unconfirmed.

## Risks / Trade-offs

- **[A new invitation shows within a minute, not instantly]** → FR-07.5 asks that it appears; polling is enough until another account's changes can be pushed.
- **[A send in flight is lost on restart]** → It reads as `unknown` after 5 minutes, with Resend.

## Migration Plan

None.
