# Proposal

## Why

TON-188 gave invitations roles, but nothing in the app shows them yet: the owner can't pick one, and the person can't tell what they may do. This change brings roles into the sharing dialog, the invitation email, the inbox and its notice, Shared with me and the sidebar tree. Linear: TON-190. It implements FR-07.14 and FR-07.18 as the app shows them.

## What Changes

- **The sharing dialog (DS-65):**
  - a role select on the invite form, starting at Can view;
  - a role select on each person's row, saved at once;
  - "Also editable through "Metal"" under a view invitation whose person already edits through a folder above;
  - the always-visible description now says what people who can edit may do, and that what they add stays in the owner's collection.
- **The person:** the invitation email, the inbox row and the new-invitation notice say an invitation is to edit. Shared with me reads "you can edit", and the sidebar tree marks the share.
- **The landing page's** sharing line names editing too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: the dialog explains editing before anything is shared and lets the owner pick and change roles; the person sees their role.

## Impact

- **Web:** `share-dialog.tsx`, `invitations.tsx`, `invitation-toasts.tsx`, `shared-with-me.tsx`, the tree (`tree.ts`, `collection-tree.tsx`) and `landing-page.tsx`.
- **API and domain:** the invitation email's template takes the role (optional, so emails queued before still send), and `invitationToDeliver` reads it.
- **Docs:** DS-65–DS-67 and the landing copy, as built.
