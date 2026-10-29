# Proposal

Linear: TON-66 (Feature). Implements FR-07.4, FR-07.5 and FR-07.6. Design: DS-31 (Invitations), DS-65 (delivery status), DS-66. Tech: TS-33, TS-72. Done when AC-22 passes.

## Why

TON-65 saves invitations, but nobody hears about them and nobody can accept them. FR-07.5 wants each invitation emailed, with delivery reported apart from the invitation itself. FR-07.6 wants the intended recipient, signed in, to accept or decline in the app.

## What Changes

- **Email delivery** (FR-07.5, TS-72):
  - **When it goes out:** a new invitation is emailed to the recipient's current sign-in address, after the response, as sign-in codes are until the job queue exists.
  - **Tracking:** the grant's `email_status` goes `sending`, then `sent` or `failed`; `unknown` when the send outlasts 30 s or the server stopped mid-send (still `sending` after 5 minutes).
  - **What it says:** the email names the owner's display name and the collection, and links to `/invitations/{id}`. The link needs sign-in as the recipient, and forwarding it grants nothing.
  - **The owner's dialog** shows each pending invitation's delivery ("sending…", "sent", "email failed", "email not confirmed"), with **Resend** when it failed or is unconfirmed.
  - **`share.resendInvitation {grantId}`** sends it again.
  - A replayed mutation never sends again.
- **Accepting and declining** (FR-07.6), by the signed-in recipient only, app-only:
  - **`share.accept {grantId}`** turns a pending invitation into access and saves the collection to the recipient's references, reusing one they have (TS-33).
  - **`share.decline {grantId}`** declines, granting nothing, and revokes no other path.
  - **Invalid invitations** answer "This invitation is no longer available.": withdrawn, revoked, declined, gone, or in Trash. Accepting twice changes nothing.
- **The inbox** (DS-66):
  - `GET /v1/invitations` lists the signed-in person's pending invitations whose collection is active: the owner's display name, the name and type, and the date.
  - `/invitations` shows them, each with **Accept** and **Decline**.
- **The email's page** (DS-66): `GET /v1/invitations/{id}` and `/invitations/{id}` show the invitation to accept or decline:
  - "This invitation is for a different account — sign out and sign in with that email" for someone else, revealing nothing of it;
  - "This invitation is no longer available" when it isn't;
  - "You accepted this invitation." once it's accepted.
- **The sidebar's Invitations item** (DS-31) shows only while invitations are pending, with their count. It checks on load, when the window regains focus, and every minute.

Saved references reach clients, and Shared with me lists them, with TON-68.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: invitations are delivered, and accepted or declined by their recipient.

## Impact

- **`packages/domain`:**
  - the `share-invitation` email template;
  - the three mutations and their store methods;
  - the inbox schemas.
- **`packages/db`:**
  - grant reads for the inbox and the page;
  - email-status recording;
  - references upsert.
- **`apps/api`:**
  - delivery after `share.invite` and `share.resendInvitation`;
  - the two routes;
  - OpenAPI: new mutations and paths.
- **`apps/web`:**
  - `/invitations` and `/invitations/$id`;
  - the sidebar item;
  - the dialog's delivery states and Resend.
- **No schema change.**
