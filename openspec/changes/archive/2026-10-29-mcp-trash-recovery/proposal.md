# Proposal

Linear: TON-84 (Feature). Implements FR-10.7, FR-01.13 to FR-01.17 and FR-14.2 through MCP, and FR-07.14 for MCP moves and recovery. Tech: TS-26, TS-63. Done when AC-36's recovery scenarios pass.

## Why

Both MCP modes can inspect Trash (TON-81), but a Manage connection can't recover anything yet. FR-10.7 asks for recovery under the app's rules:
- the destination prompts;
- the name prompts;
- the skip reports;
- sharing effects.

Expired or purged items are reported as unavailable. The app's recovery also accepts a unit past its 30 days until the hourly purge removes it, which FR-01.17 ("enforced at 30 days") doesn't allow. And TON-82's `move_items` doesn't yet report sharing effects, which FR-07.14 asks MCP to.

## What Changes

- **`recover_from_trash {items: [{unitId, parentId?, name?}]}`:**
  - each unit is recovered by the app's `trash.recover`, on its own;
  - a missing or trashed parent answers `needs_input` `destination`, and a taken name `name`;
  - the agent sends the item again with `parentId` or `name`;
  - confirmed items carry the skip report.
- **Sharing effects** (FR-07.14): each recovered unit and each `move_items` move reports who newly sees it, who no longer does, and the shares it keeps, as the app previews them.
- **Expiry at recovery:** `trash.recover` refuses a unit past its expiry as `expired`, in the app and MCP alike.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: recovery from Trash, and sharing effects in MCP results.
- `trash-and-recovery`: expiry is enforced at recovery.

## Impact

- **`packages/domain`:** `recoverUnit` checks expiry.
- **`apps/api`:** `recover_from_trash`, and sharing effects on `move_items`.
- **No schema change. No `/v1` change.**
- **Docs:** TS-63 as built.
