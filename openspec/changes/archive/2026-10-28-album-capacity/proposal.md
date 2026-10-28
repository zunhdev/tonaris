# Proposal

Linear: TON-60 (Feature). Implements:
- FR-15.1, the 5,000-album limit;
- FR-15.2, counting active and trashed records;
- FR-15.3, one limit everywhere, with a clear reason;
- FR-15.4's capture rate (TS-18).

Design: DS-98 (the usage meter and capture notices). Done when AC-32 passes.

## Why

Albums aren't counted: an owner can save any number, so the limit FR-15.1 sets, and the performance targets assume, isn't kept. TS-18's capture rate isn't kept either. Nothing shows the owner how much of the limit is used.

## What Changes

- **The album limit (5,000, Trash included):**
  - `album.create` and a capture that would make a new record are refused at it with `capacity_exceeded`: "You've reached 5,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more.";
  - restoring and re-adding reuse their slot and work at the limit;
  - a batch reports each refused item, as any batch does;
  - MCP has no album-creating tool yet; its capture in M9 runs the same command.
- **Captures: 100 an hour per account,** counted from the mutations received, refused before any provider is asked: `rate_limited`, "You've added 100 albums from links in the last hour. Try again later, or enter an album manually."
- **Settings → Data:**
  - joins the subnav (DS-92), with the usage meter: "4,812 of 5,000 albums · 37 in Trash", and a bar split into active and trashed;
  - counted on the client from its albums and Trash units.
- **The capture dialog and manual entry** show a quiet notice from 95%, and the refusal's words at the limit, with links to Trash and to the usage.
- **Already enforced elsewhere:** the other limits TS-18 lists that exist so far (containers, memberships, fields, options, names, descriptions, text, batch size).
- **Left to their issues:** MCP's per-grant rates (TON-85) and export rates (TON-89).

## Capabilities

### New Capabilities

- `capacity-limits`: the album limit and its meter, and the capture rate.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:**
  - `maxAlbums`, `maxCapturesPerHour`;
  - `albumCapacityProblem` and `hasAlbumSlot`;
  - the store's `countAlbums`.
- **`packages/db`:** `countAlbums`, `capturesSince`.
- **`apps/api`:** the capture rate in the mutation runner.
- **`apps/web`:**
  - Settings → Data, the meter, and the capture notices;
  - the route and the subnav.
- **No schema change, and no API schema change.**
