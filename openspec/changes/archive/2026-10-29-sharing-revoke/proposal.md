# Proposal

Linear: TON-67 (Feature). Implements FR-07.7, FR-07.15 and FR-07.16. Tech: TS-32, TS-33. Done when AC-23 passes.

## Why

Access can be given (TON-65, TON-66) but not taken back. Recipients need to leave a share. Owners need to revoke the invitations they see in the dialog. Links must stay dead once turned off, and saved references must never move to a new link by themselves.

Turning a link off and on again shipped with TON-65's switch; this change adds the rest and AC-23's checks.

## What Changes

- **`share.leave {containerId}`** (FR-07.7), by the recipient, app-only: withdraws their accepted invitation to that folder or list, with the descendant access through it.
  - Their reference goes when it has no link. One saved through a link stays, as does every other grant.
  - The owner's content and other viewers are unaffected.
  - A later invitation starts as pending, and Trash recovery never revives a withdrawn grant.
- **`share.revoke {grantId}`** (FR-07.15), by the owner, app-only: revokes a pending or accepted invitation.
  - The recipient's other paths, such as a link, still work.
  - Their reference stays, to show as no longer available (DS-67) until they remove it.
- **The dialog's invitation rows** get a menu with **Remove access**, which revokes.
- **Links** (FR-07.16, already built): a reference saved through a link that is turned off is inaccessible. Turning the link on again doesn't revive it; saving it again through the new link (TON-68) reuses the reference.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: recipients leave, and owners revoke.

## Impact

- **`packages/domain`:** the two commands, and a store method to drop a reference that has no link.
- **`packages/db`:** that method.
- **`apps/api`:** OpenAPI gains two mutations.
- **`apps/web`:** the dialog's row menu. Leaving needs a place in Shared with me, which TON-68 builds, so it is exercised through the API here.
- **No schema change.**
