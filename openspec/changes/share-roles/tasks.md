# Tasks

## 1. The role and its model (domain)

- [x] 1.1 `shareRoles` (`view`, `edit`) in `packages/domain/src/sharing.ts`; `SharingState` grants carry `role`; `editableContainers(state, userId)` and `roleOn(state, viewer, id)`. Unit tests in `sharing.test.ts`: edit only from accepted edit grants, the higher role through a folder, links and references never edit, Trash cuts the walk (scenarios "Edit through a folder", "A link reads only", "Suspended by Trash").
- [x] 1.2 The domain's property test over moves, Trash and recovery also checks `editableContainers` against an upward reading, with random roles.

## 2. Inviting and changing roles (domain)

- [x] 2.1 `share.invite` takes an optional `role`, default view; the store port and in-memory store keep `role` on grants and return it from `findGrant`/`findOpenGrant`. Tests in `sharing-commands.test.ts`: "Inviting to edit", "The default", and re-inviting keeps the open invitation's role.
- [x] 2.2 `share.setRole {grantId, role}`: the mutation schema and handler, owner-only through `shareable` (app-only), pending or accepted grants even in Trash, `not_found` otherwise; the store port's `setGrantRole`. Tests: "Raised without a new acceptance" (the model gives edit after it), "Not through MCP", someone else's grant, an ended grant.
- [x] 2.3 The ledger event `shareGrant.roleLowered {grantId}` in `packages/domain/src/ledger.ts`. Its schema test passes.

## 3. The database

- [x] 3.1 `share_grants.role` with default `view` and a check, plus its migration from `bun run db:generate`. `bun run db:check` passes.
- [x] 3.2 The store's grants (`packages/db/src/store/sharing.ts`) insert and return `role`, and `setGrantRole` records `shareGrant.roleLowered` when edit becomes view. A test in `packages/db` shows the ledger job is queued for a lowering and not for a raise.
- [x] 3.3 `editableContainers(db, userId)` and `canEditContainer(db, userId, id)` in `access.ts`. The CTE property test in `sharing.test.ts` gives grants random roles and checks both against the model.
- [x] 3.4 The ledger replay lowers a role (`ledger-replay.ts`). A replay test: "Restored from before the change".

## 4. Reads that say the role

- [x] 4.1 `shareSettingsSchema` invitations gain `role` and `editableThrough`; `shareSettings` fills them. A db test: "The owner's dialog".
- [x] 4.2 `invitationSchema` gains `role`; `pendingInvitations` and `invitationState` fill it. A db test.
- [x] 4.3 `sharedEntrySchema` gains `role` (null while unavailable); `sharedWithMe` fills it. A db test: "Shared with me".
- [x] 4.4 `sharedSnapshotSchema` gains `role`; `sharedSnapshot` fills it, and gives an editor all the owner's fields with all options. A db test: "An unused field", for an editor and a viewer.
- [x] 4.5 The API's OpenAPI document is regenerated (`bun run openapi:check` passes), with `oasdiff-ignore.txt` entries for the widened `share.invite` request and the invitation page's response. API tests that compare these responses still pass.

## 5. Verification

- [x] 5.1 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Archive the change as the PR's last commit, then run `bun run check:specs` on the merged spec.
- Open the PR with `Closes TON-188`, wait for CI (oasdiff included), and merge.
