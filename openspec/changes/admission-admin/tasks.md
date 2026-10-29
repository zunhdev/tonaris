# Tasks

## 1. Domain and storage

- [x] 1.1 Add the admin's schemas and refusal sentences to `packages/domain/src/admission.ts`: the invitation as listed, the list, invite, and pause. Verify with domain tests for the sentences and schemas.
- [x] 1.2 Add the storage functions to `packages/db/src/admission.ts`, following design decisions 2–4 and 6:
  - issue, refusing registered and invited addresses and marking an expired row first;
  - list;
  - rotate a token;
  - revoke only what's available and unexpired;
  - expire.

  Verify with database tests:
  - a registered address is refused;
  - an available invitation blocks a second one, including two at once;
  - an expired row is marked, then re-issued;
  - rotate and revoke skip revoked, redeemed and expired invitations;
  - the expiry marks only past rows.

## 2. API

- [x] 2.1 Add `/v1/admin/admissions` (design decision 1), the email with `invitationLink`, and the `expire-admission-invitations` schedule. Regenerate OpenAPI. Verify with API tests for AC-02:
  - a non-creator gets 403 and a signed-out visitor 401;
  - inviting emails the link, and its delivery goes from sending to sent; a refused email shows failed;
  - registered and already-invited addresses are refused, and an expired one is invited again;
  - resend emails a new link, and the old one stops working;
  - revoking blocks the join and leaves an admitted account alone;
  - pausing blocks the join, keeps sign-in and invitations as they were, and resuming makes it work again;
  - a forwarded invitation's code goes only to its address;
  - a retried join creates one account;
  - the schedule is listed.

## 3. Web

- [x] 3.1 Add the `/admin/admissions` route and the Admin entry in the account menu (design decision 7). Verify with Playwright in `admin-admissions.e2e.ts`:
  - the creator invites an address and sees it as available, then sent, and the email arrives;
  - a member's address is refused with its sentence;
  - Revoke makes the row revoked;
  - pausing shows the note, and resuming hides it;
  - axe finds no violations;
  - a non-creator sees no Admin entry, and the URL shows not found.

## 4. Docs

- [x] 4.1 Record DS-100 and DS-31 as built, TS-71's re-issue decision, and TS-91's job name. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison with main (only additions).

## Workflow follow-up

- Archive the change as the PR's last commit.
