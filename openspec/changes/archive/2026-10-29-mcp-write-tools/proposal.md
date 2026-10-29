# Proposal

Linear: TON-82 (Feature). Implements FR-10.4, FR-10.5, FR-13.4 for MCP, FR-07.13 for agents, and X-03. Tech: TS-22, TS-62, TS-63. Done when contract tests pass for AC-36's ordinary operations and AC-37's rejections.

## Why

A Manage collection connection has only G3's stand-in `add_to_list`. It wrote memberships directly, bypassing the commands and the change log, so the person's other sessions never saw an agent's change. FR-10.4 lists the ordinary operations an agent makes without the owner's approval. X-02 says they follow the app's rules exactly.

## What Changes

- **Write tools** for Manage collection connections. Each plans the app's own mutation envelopes, run as one batch through the API's mutation runner:
  - organizing: `create_container`, `rename_container`, `set_description`, `move_items`, `add_to_lists`, `remove_from_lists`, `move_albums`, `set_order`, `set_view_preferences`;
  - albums: `add_albums` (links or details, optionally into a list), `update_album`, `set_artwork`, `set_link`, `remove_link`, `set_album_fields`;
  - fields: `create_field`, `rename_field`, `change_field_type`, `add_options`, `rename_option`, `remove_options` (unused options only, until TON-83);
  - references: `save_shared_reference`, `remove_shared_reference`.
- **Outcomes:**
  - each item reports TS-27's outcome, including `needs_input` for a link to answer and `skipped` after a failed step;
  - independent items stay done when others fail (FR-13.4);
  - changes reach the person's streams as they commit (X-08).
- **`idempotencyKey`** on every write is any text, the connection's own.
  - It names the batch, through `mcp_operations`. The IDs of its mutations and new records are derived from it, so sending it again replays what ran.
  - A key reused for a different change is refused.
  - `get_operation` reports a key's steps.
- **References:** a Manage agent may save a share link to Shared with me, and remove a reference, as FR-07.13 says; a Read-only one may not. M7 had left these app-only until M9 decided.
- **Base values:** a change without `base` is based on the values saved now. With it, a stale base is a `conflict` (TS-21).
- **App-only stays out:**
  - no tool for Trash purge, sharing management, account actions, export or admission;
  - the commands refuse an MCP principal with `app_only` (AC-37).
- **`planMove`** moves from the web app to `packages/domain`, so `set_order` makes the app's own moves.
- **G3's `add_to_list`** and the `addToList` stand-in go.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: ordinary writes, their outcomes and their retries.
- `sharing`: a Manage agent keeps and drops references.

## Impact

- **`packages/db`:**
  - the `mcp_operations` table and migration;
  - `mcp-writes.ts` for claiming keys, base values and a view's sequence;
  - `findFieldIn` exported;
  - keys pruned with the sync history.
- **`packages/domain`:** `planMove` and `Place`; `share.saveLink` and `share.removeReference` authorize as collection writes.
- **`apps/api`:**
  - `mcp/writes.ts` holds the writer and derived IDs, and `mcp/write-tools.ts` the tools;
  - `mcpRoutes` takes the hub, capture and sharing deps;
  - `get_operation` reads keys.
- **`apps/web`:** `order.ts` re-exports `planMove`.
- **Docs:** TS-11, TS-22, TS-63 and TS-91.
