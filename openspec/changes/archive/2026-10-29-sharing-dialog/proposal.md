# Proposal

Linear: TON-65 (Feature). Implements FR-07.1, FR-07.2, FR-07.3, FR-07.4 and FR-07.14 for sharing, and FR-11.3's guard. Design: DS-65. Tech: TS-32, TS-34. Done when AC-21 (before sharing) and AC-38 pass.

## Why

TON-64 decides who may read shared content, but nobody can share yet. Owners need DS-65's dialog: invite people by email, turn a link on, and see who already has access. Disclosures shown before every share, and a display name the owner can't clear while sharing, protect them.

## What Changes

- **Share links are derived** (decided with the creator, 29 October 2026). A link's token is the HMAC-SHA256 of its ID under the server secret (`BETTER_AUTH_SECRET`), base64url. The database still stores only its SHA-256, so a database leak alone reveals no link. The dialog can show the link every time.
  - Rotating the secret invalidates every link; owners turn links off and on again. TS-32 records this.
- **New mutations,** owner and app only (X-03; MCP gets `app_only`):
  - **`share.invite {grantId, containerId, email}`:**
    - requires a display name;
    - finds the account by email, else `recipient_not_found` (FR-07.4: no account, admission or queued invitation is created);
    - refuses inviting yourself;
    - saves a pending grant with the address as typed.

    Inviting someone who already has a pending or accepted grant answers that grant (FR-07.5: retries never duplicate). Email delivery, the inbox and acceptance come with TON-66.
  - **`share.setLink {containerId, linkId, enabled}`:** turning on requires a display name and creates a link, or keeps the live one. Turning off revokes it for good (FR-07.16); turning on again makes a new link.
  - **`account.setDisplayName {displayName}`:** a blank name is refused with `display_name_required` while the account has a pending or accepted grant or a live link (TS-34, AC-38). Settings will use it in M8.
- **`GET /v1/containers/{id}/sharing`,** owner only:
  - the open invitations, each with the address as typed, the person's display name, status and email status;
  - the live link's URL;
  - access inherited from folders above: how many people, and whether through a link;
  - the owner's display name.
- **The sharing dialog** (DS-65), from a **Share** button in a folder's or list's header, **⇧S**, and the palette's "Share…":
  - disclosures always at the top (FR-07.14): fields, a folder's descendants, and, beside the switch, that anyone with the link can view and forward it;
  - invite by email, with an inline error that keeps the typed address;
  - each invitation's status;
  - inherited access, read-only, linking to the ancestor's dialog;
  - the link switch, with Copy, and an inline confirmation to turn it off;
  - while there's no display name, an inline "Add a display name to share" field instead of Invite and the switch.
  - Desktop and owner only; it waits while offline.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: owners share by invitation and link, informed by disclosures, with a display name.

## Impact

- **`packages/domain`:**
  - the three commands;
  - the store's sharing and account methods;
  - `shareToken(secret, linkId)`, which replaces TON-64's random token;
  - the error codes `recipient_not_found` and `display_name_required`;
  - the sharing state schema.
- **`packages/db`:**
  - a migration adding `share_grants.invited_email`;
  - the store methods;
  - `sharingState()`.
- **`apps/api`:**
  - the route;
  - the link hash, prepared before the write lock as `link.set`'s URL is;
  - the regenerated OpenAPI document: new mutations, a new path, and two new error codes in responses.
- **`apps/web`:**
  - `features/sharing/`;
  - the header button;
  - ⇧S and the palette command;
  - the reference.
