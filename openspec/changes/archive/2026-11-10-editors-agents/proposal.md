# Proposal

## Why

The creator decided on 10 November 2026 that an editor's AI agent edits a share in the first version, as the editor can in the app. The domain already lets a Manage collection connection edit as its person does (TON-189). The MCP layer still read "the values saved now" only from the person's own collection, gave agents no way to tell which shares they could edit, and locked an approved batch's accounts in an order that could deadlock between two people's shares. Linear: TON-192. It implements FR-10.3 and FR-10.4 for editors, within FR-07.19–FR-07.21 and X-03.

## What Changes

- `list_shared_with_me` gives each share's role, and the server's instructions tell agents that shares with role edit take the write tools, inside them only.
- The values a change is based on, when the agent sends none, are read for content the person edits too. For content they can't change, `update_album` answers `not_found` rather than a validation failure.
- An approved batch takes every write lock it needs first, the agent's own included, in one order (`lockCollections`).
- The field and option tools and `recover_from_trash` stay refused on another owner's content, as the commands already decide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: editors' Manage collection agents change shares the person can edit, as the app does; Read-only agents still only read.

## Impact

- **API:** `apps/api/src/mcp/read-tools.ts` (`role`), `server.ts` (the instructions), `write-tools.ts` (`update_album`'s base), `writes.ts` (`lockCollections`).
- **Database:** `mcp-writes.ts`'s bases, `canEditAlbum` in `access.ts`, `lockCollections` in `sync.ts`.
- **Docs:** TS-63 as built; the MCP verification script's step 10.
