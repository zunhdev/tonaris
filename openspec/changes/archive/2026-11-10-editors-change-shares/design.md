# Design

## Context

Every content command asks one of three helpers whether the principal may change what it names: `changeableContainer`, `changeableList` or `changeableAlbum`. Creates ask `actingOwner`, which assumes the actor's own collection. The runner locks and logs the actor's account. TON-188 added the effective role (`editableContainers`), with SQL walks in `access.ts`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One decision point for editor access, used by every content command.
- The owner's lock and log for an editor's change.
- Nothing outside the share learned through refusals or capture results.

**Non-Goals:**
- Previews, the editor's view and MCP tools (TON-195, TON-191, TON-192).

## Decisions

**`contentAccess` beside the policy, not inside it.** `authorizeWrite` is a pure owner check, and editing needs the sharing model, which is a store read. `contentAccess(context, container)` answers in one of three ways:
- **owner**, under the policy;
- **editor**, with `through`: the shares the actor edits it through, from `editSourcesAbove`;
- **a failure:** `permission_denied` for a reader, `not_found` for anyone else.

The helpers return the record with its access, so commands apply share-edge rules (`insideShare`) without asking again.

**The share's edge is "through".** A move is allowed when some share above both the item and the destination isn't the item itself. That one rule covers several cases: the shared folder or list never moves, nothing leaves a share, and nothing crosses between two shares. The same `insideShare` test refuses deleting the share's own folder or list.

**Albums through lists.** An editor changes an album only through an active list they edit (`editableLists`). Field-value, link and artwork commands all go through `changeableAlbum`, so they follow. `membership.add` takes only albums the editor sees (an active list they read), so other albums of the owner's can't be reached by ID. Capture and a new album's own entry skip that check (`anyAlbum`), because the command chose the album.

**An editor's album deletion.** If any active list outside `editableLists` holds the album, only the editable lists' entries go. Otherwise the album is trashed as the owner's deletion would trash it, with `deletedBy`. The command result says nothing either way.

**Capture.** It saves in the list's owner's collection. The API's preparation matches against the same collection (`captureCollection`), while YouTube's terms check stays the actor's. A reuse of an album the editor didn't see reports `created`.

**Trash Undo.** `trash_units.deleted_by` has no foreign key, since the editor's account may go while the unit stays. `trash.recover` by a non-owner works only for a `user` principal (not an agent), on a folder or list unit they deleted, with no new destination, while the original parent is still editable.

**The runner.** `collectionOf` reads the owner of what a mutation names (`targetOf`, an exhaustive switch) before taking the lock. The changes go to that account's log and `ExecutedMutation.accountId`. The `mutations` row stays the actor's, so replays, `GET /v1/mutations/{id}` and the capture rate are theirs. A claim locks the actor's own account.
- *Alternative:* refusing batches that span collections. Not needed: each item already runs as its own mutation under its own lock (TS-25).

## Risks / Trade-offs

- [A command missing the share-edge check] → Every content command goes through the three helpers. Tests cover each rule with an editor, a viewer and a stranger.
- [Lock contention on the owner's account] → Editors' writes are as rare as the owner's; one lock per mutation.
- [MCP approved batches lock the agent's account and then the owner's] → A rare deadlock between two people editing each other's shares through approvals, which Postgres resolves by failing one. TON-192 looks at it.
- [Strangers now get `not_found` instead of `permission_denied`] → Intended (FR-07.20). No client tells the two apart for content.

## Migration Plan

One additive migration (`trash_units.deleted_by`). Existing units have none, as they were the owners'.
