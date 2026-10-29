# Proposal

Linear: TON-74 (Feature). Implements FR-11.6. Design: DS-100, DS-31. Tech: TS-71, TS-91. Done when AC-02 passes.

## Why

Admission works (TON-24): an invitation's token, a code to its address, and one transaction that creates the account. But the creator can't issue an invitation, see one, revoke it, or pause admissions without a database console. Email delivery (TON-73) is ready to carry invitations, and TON-75's landing page needs invitations to exist.

## What Changes

- **Admin → Admissions** (`/admin/admissions`, DS-100), for the creator only. Other accounts don't see Admin in the account menu, and the page answers as not found for them.
  - **"Accepting new members" switch:** pauses and resumes admissions. Pausing shows its note, and existing members and outstanding invitations are unaffected.
  - **Invite:** an email input. The invitation is bound to that address, single-use, and expires after 14 days. It is emailed at once.
  - **Table:** email, status (available, redeemed, revoked, expired), created, expires, and email delivery (sending, sent, failed, not confirmed).
    - **Resend** shows when the email failed or wasn't confirmed.
    - **Revoke** shows while the invitation is available.
- **Creator-only `/v1/admin/admissions` routes:** list, invite, resend, revoke, and pause or resume. They are app-only, like Connections.
  - Invitations are refused for an address that already has an account, or one that has an available invitation.
  - An expired invitation's address can be invited again. This settles TS-71's open "renew or mark first" in favour of marking it expired first.
- **Resend issues a new link:** only the token's hash is stored, so the earlier link stops working. The invitation keeps its expiry.
- **A daily job,** `expire-admission-invitations` (TS-91), records expired invitations. Expiry is still checked on use, as before.
- **The admission-invitation email** links to `/join/:token`. That page arrives with TON-75.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admission`: the creator's administration of invitations and the pause switch (FR-11.6).

## Impact

- **`packages/domain`:** the admin's request and response schemas.
- **`packages/db`:** functions to issue (refusing registered and already-invited addresses, and marking an expired row first), list, rotate a token, revoke only what's available, and expire. No schema change.
- **`apps/api`:** the new `/v1/admin/admissions` routes in OpenAPI (additive) and the daily schedule.
- **`apps/web`:** the Admin route, and Admin in the account menu for the creator.
- **Docs:** DS-100, DS-31, TS-71 and TS-91 recorded as built.
