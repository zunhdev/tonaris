# Proposal

Linear: TON-83 (Feature). Implements FR-10.6, FR-07.14 for MCP, and X-07. Design: DS-86, DS-87. Tech: TS-64. Done when an expanded scope requires a fresh approval, and declined or expired approvals change nothing.

## Why

G3 proved the approval round trip with one stand-in tool, `delete_albums`, which trashed albums without the app's commands or the change log. FR-10.6 gates four operations:
- deleting albums, lists or folders into Trash;
- removing options albums choose;
- permanently deleting a field;
- confirming an uncertain match.

The owner must approve each exact scope in Tonaris: its sharing effects, what stays, and whether it can be undone. The app must show waiting requests (DS-86).

## What Changes

- **Gated tools for Manage connections:**
  - `delete_items` (folders, lists, albums);
  - `delete_field`;
  - `remove_options`: unused options go at once, and chosen ones need approval;
  - `confirm_match`.

  Each asks with `needs_approval` and a link, then runs the app's own commands once approved. They replace `delete_albums`.
- **One scope shape for every operation:**
  - the albums affected, and what Trash keeps (or that nothing can be undone);
  - the folders and lists with what's inside;
  - the albums going to Unsorted;
  - who no longer sees it (FR-07.14);
  - the field and options with their albums;
  - the match.

  Summaries and consequences are in Tonaris's words.
- **Atomic use:** the approved batch runs in one transaction, after the owner's lock and the scope's recomputation, so the approval is used with the change, or not at all. A scope that grew asks again. A retry under the same key replays.
- **The approval page** (DS-87) shows each operation's scope.
- **Settings → Connections** lists "Waiting for your approval ({n})", and the sidebar shows **Approvals** with the count while some wait (DS-86).
- **`GET /v1/approvals`** returns the pending list.
- **`add_albums`** no longer takes a match choice: matches go through `confirm_match`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: gated operations and their approvals.

## Impact

- **`packages/domain`:** `approvalScopeSchema` and its builders, the summaries and consequences, `deletionImpact()`, and `pendingApprovalsSchema`.
- **`packages/db`:**
  - `approvals.batch_id` and the widened operation check (migration);
  - `useApproval()`, `pendingApprovals()`, `deletionTargets()`, `savedAlbumOfReleaseGroup()`;
  - the field scopes in a transaction;
  - `executeMutation` and `executeBatch` accept a transaction;
  - approvals pruned after 30 days;
  - `trashAlbums` removed.
- **`apps/api`:**
  - `mcp/approvals.ts` holds the generic round trip, and `mcp/gated-tools.ts` the tools;
  - the writer's `writeApproved()`;
  - `GET /v1/approvals`, and the approval response's scope gains properties.
- **`apps/web`:** the approval page's scope, the pending-approvals store, Settings → Connections, and the sidebar place.
- **Docs:** TS-63, TS-64, TS-91, DS-31, DS-86, DS-87.
