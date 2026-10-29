# Proposal

Linear: TON-75 (Feature). Implements FR-11.2 and FR-11.3. Design: DS-91, DS-105. Tech: TS-71. Done when AC-01 passes.

## Why

The creator can now issue invitations (TON-74), and the join flow exists in the API (TON-24). But the invitation email links to `/join/:token`, which no page answers yet, so nobody can join.

## What Changes

- **The `/join/:token` landing** (DS-91):
  - "You're invited to Tonaris", with the email address the invitation is bound to.
  - **Continue** sends a code to that address and leads to "Check {email}". The code step works like sign-in's: the code field, a resend after 30 seconds, and the email's link, which joins at once in the browser that asked, or first asks "Join on this device?" elsewhere.
  - **Joining** creates the account and signs in. Then comes an optional display-name step ("You can add this later"), and then the collection's first-run empty state.
  - **An unusable invitation** gets its one sentence and nothing else: invalid, revoked, expired, already used, or admissions paused.
- **`POST /auth/admission/invitation {token}`:** answers the bound address, or the refusal, without sending anything. The page shows the address before a code is sent.
- **The first-run empty state** (DS-105) adds its secondary action, "Connect an AI assistant", which opens Settings → Connections.
- **Join URLs carry their token,** so their pages send no `Referer`, as guest share URLs don't (TS-32).
- **The sign-in code field and resend countdown** move into shared pieces that both pages use.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admission`: joining with an invitation, from the landing to the first-run state (FR-11.2, FR-11.3).
- `app-shell`: the empty collection's secondary action (DS-105).

## Impact

- **`apps/api`:** the lookup endpoint beside `/auth/admission/code` and `/auth/admission/join`, hidden from OpenAPI like them.
- **`apps/web`:**
  - the `/join/$token` route;
  - auth-client calls for the lookup, the code and the join;
  - the shared code field;
  - the root's empty state;
  - the Referer policy.
- **Docs:** DS-91 and DS-105 recorded as built, and TS-71's endpoint list.
- **No schema change.**
