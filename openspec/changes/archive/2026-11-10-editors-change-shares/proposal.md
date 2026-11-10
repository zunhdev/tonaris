# Proposal

## Why

TON-188 gave invitations a role and worked out who can edit what. Commands still let only owners change content. This change lets editors change a share through the same commands, in the owner's collection, and only inside the share. It's the first time one person writes to another's collection, so every command checks the share's edge. Linear: TON-189. It implements FR-07.19, FR-07.20 and FR-07.21, with X-01, FR-10.4 and FR-14.1 as they apply to editors.

## What Changes

- **Folders and lists:** editors create, rename, describe, color, move and delete them inside the share, in the owner's collection. The shared folder or list itself is only renamed, described or colored. Moves stay inside one share.
- **Albums:**
  - editors change albums in lists they edit, with the owner's field values, but never field definitions;
  - they add albums they see, and new ones: `album.create` takes an optional `listId`, and a capture into a share saves in the owner's collection;
  - reusing an album the editor didn't see reports it as added.
- **Deleting an album:** an editor's deletion takes it out of the lists they edit; it goes to the owner's Trash only when no other list of the owner's holds it.
- **Trash:** a unit records the editor who deleted it. That editor can undo a folder or list deletion in the app; the rest of the owner's Trash stays the owner's.
- **Refusals:** a reader is told they can only view, and anyone else, strangers included, gets `not_found`. Strangers used to get `permission_denied`.
- **Sync:** an editor's mutation locks and logs the owner's account, so the owner's devices and the share's viewers update live. The idempotency row and capture count stay the editor's.
- **Manage collection agents** edit as their person does; Read-only ones don't. The tools themselves are TON-192.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: editors change folders, lists and albums inside shares they can edit, with the limits FR-07.20 and FR-07.21 set.

## Impact

- **Domain (`packages/domain`):** `contentAccess`, `collectionFor` and `insideShare` in `command-kit.ts`, and `authorizeShareEdit` in `policies.ts`. These are used by the container, album, membership, capture and Trash commands. The store port gains `editSourcesAbove`; Trash units gain `deletedBy`.
- **Database (`packages/db`):**
  - `trash_units.deleted_by`, an additive migration;
  - `editSourcesAbove` and `captureCollection` in `access.ts`;
  - the runner locks and logs the collection a mutation changes (`targetOf`, `collectionOf`), and `ExecutedMutation.accountId` names it.
- **API:** the announcer publishes to that account, and capture prepares against the list owner's collection. `album.create` gains an optional `listId`, changed in place during closed testing, with oasdiff ignore entries if CI reads it as a removal.
- **Docs:** TS-20 and TS-30 record how it's built.
- **Not here:** sharing previews for editors and the editor's view (TON-195, TON-191), and the MCP tools (TON-192).
