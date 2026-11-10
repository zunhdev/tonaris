# Design

## Context

Read access through sharing is defined once in the domain (`readableContainers` in `packages/domain/src/sharing.ts`). The database walks the same rule with recursive CTEs (`readableContainers` and `canReadContainer` in `packages/db/src/access.ts`), and a property test holds the two equal over random states. Grants (`share_grants`) have a status but no role. Owner writes, sharing commands included, already wake the share's viewers' streams (`notify`, TS-23). See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A role on each grant, and an effective role defined as access is: a domain model, SQL walks, and property tests holding them equal.
- Reads that tell owners, recipients and readers the role.
- A lowered role survives a restore.

**Non-Goals:**
- Letting editors change anything. Commands still allow only the owner (TON-189).
- Showing roles in the web app (TON-190) or editing in it (TON-191).

## Decisions

**A column on the grant, not a second table.** `share_grants.role text not null default 'view'`, with a check. An invitation is one person on one container, and a role belongs to exactly that. The open-grant unique index stays as it is, so a person still has at most one open invitation per container.

**The effective role is a second walk, from edit sources only.** `editableContainers(state, userId)` walks down from the person's accepted grants with role edit, through active children, exactly as `readableContainers` walks from all sources. A person's role on C is then edit if C is editable, view if C is readable, and none otherwise (`roleOn`).
- Links and saved references are never edit sources, so "links only give view" holds by construction.
- *Alternative:* return a role per container from one walk. That would change `readableContainers`' shape and its callers. A second walk keeps the read path as it is, and the trees are small (at most 2,000 containers).

**SQL mirrors the model.** In `access.ts`, `editSourcesOf(userId)` selects accepted grants with role edit. `editableContainers(db, userId)` and `canEditContainer(db, userId, id)` reuse the same `descendantsCte` and `ancestorsCte` as the read functions. The existing property test gains roles on random grants and compares the editable sets and checks too.

**`share.invite` takes `role` in place; `share.setRole` is new.**
- `role` is optional on `share.invite`, defaulting to view. Re-inviting someone with an open invitation keeps it, role included, as it keeps the invitation today; `share.setRole` changes a role.
- `share.setRole {grantId, role}` uses `shareable()` (owner, `sharing` scope, so app-only) and acts on pending or accepted grants, even in Trash, as revoking does. A role set to what it already is applies with no change. Any other grant is `not_found`.
- oasdiff reads the changed `share.invite` request as a removal. Closed testing allows widening it in place with an ignore entry (decided 5 November 2026).

**The ledger records only lowering.** `shareGrant.roleLowered {grantId}` is appended when edit becomes view. Raising a role isn't deletion-class: a restore that loses a raise errs on the safe side, and the owner raises it again. The replay sets role view on that grant, whatever its status.

**Reads.**
- **`shareSettings`:** each invitation gains `role`, and `editableThrough`: the nearest folder above with that person's accepted edit grant, `{containerId, name}` or null. It's found with the existing ancestors walk.
- **Invitations** (`pendingInvitations`, `invitationState`) gain `role`.
- **`sharedWithMe`** entries gain `role`: the effective role while available, else null.
- **`sharedSnapshot`** gains `role`: view for a link, the effective role for a person. For an editor, `fields` are all the owner's definitions with all their options, read with the same columns and ordering.

**In-memory store.** Grant rows gain `role`, and the store port gains `setGrantRole(id, role)`. `findGrant` returns the role, so `share.setRole` can tell a lowering.

## Risks / Trade-offs

- [A restore loses a raised role] → Accepted. It is the safe direction, and the owner sees the role in the dialog.
- [Two walks per editor read] → Each is bounded by the depth limit and the tree size, like the existing read walk.
- [oasdiff flags `share.invite`] → An ignore entry naming the change, removed again once spent.

## Migration Plan

- One additive migration: the column with default `view` and its check. Existing grants become view, which is today's behavior.
- Rollback: the column is ignored by older code. Drop it only if the feature is abandoned.
