# Proposal

## Why

Sharing is view-only today. The creator decided on 10 November 2026 (P-TON-47) that an owner can let chosen people edit a shared folder or list. This change adds the foundation: a role on each invitation, and the role a person has through folders above. What editors can then do is TON-189's. Linear: TON-188. It implements FR-07.18, with the role parts of FR-07.6, FR-07.12 and FR-07.15.

## What Changes

- Each invitation has a role, **view** or **edit**. Existing invitations are view.
- `share.invite` takes an optional role, view by default.
- A new owner-only, app-only `share.setRole` changes a pending or accepted invitation's role. The person doesn't accept again.
- A person's role on a folder or list is the highest among their accepted invitations to it and to its active folders above. Links only ever give view. Trash suspends a role, and recovery resumes it, as for access.
- What reads say:
  - the owner's sharing settings give each invitation's role, and the nearest folder above through which that person can edit;
  - the recipient's invitations, and Shared with me, give the role;
  - the shared snapshot gives the reader's role. An editor's snapshot carries all the owner's fields with all their options, not only the ones in use.
- Lowering a role from edit to view is recorded in the revocation ledger, and a restore replays it, so a restored backup never brings edit rights back.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: invitations carry a role; the effective role through folders; changing a role; what reads say of roles; the editor's snapshot of fields; the ledger keeps a lowered role lowered.

## Impact

- **Database:** `share_grants.role` (`view` | `edit`, default `view`, checked), an additive migration.
- **Domain (`packages/domain`):**
  - `shareRoles`, and `SharingState`'s grants gain their role;
  - `editableContainers` and `roleOn` model the effective role;
  - `share.invite` takes a role, and the new `share.setRole` command;
  - the ledger event `shareGrant.roleLowered`;
  - schemas for settings, invitations, Shared with me and the snapshot gain the role.
- **Database reads (`packages/db`):**
  - `editableContainers` and `canEditContainer` in `access.ts`, walked like the read access and held equal to the model by property tests;
  - `shareSettings`, `pendingInvitations`, `invitationState`, `sharedWithMe` and `sharedSnapshot` give roles;
  - the ledger replay lowers roles.
- **API:** `/v1` gains `share.setRole` and optional `role` on `share.invite`, plus response fields. The additions are additive, but oasdiff reads the edited `share.invite` request as a removal: closed testing allows changing it in place, with an ignore entry (decided 5 November 2026).
- **Web:** none yet. TON-190 shows roles and TON-191 uses them.
