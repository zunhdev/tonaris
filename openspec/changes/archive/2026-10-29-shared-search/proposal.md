# Proposal

Linear: TON-72 (Feature). Implements FR-12.3. Tech: TS-50. Done when AC-25's shared part passes and private ancestor folders never appear in results.

## Why

Search covers only the person's own collection. FR-12.3 wants it to include what's shared with them: content reached through accepted invitations, and link-shared collections they saved to Shared with me. Results must be told apart from their own, show only paths they can see, and follow live changes, revocation, moves, Trash and recovery. The app and MCP must agree (AC-25).

## What Changes

- **Server search covers shared content** (FR-12.3, TS-50):
  - `searchCollection()` adds `shared: {folders, lists, albums}`: what the person reads through sharing, as the access rules decide it (accepted invitations and live links they saved), matched and ranked as their own.
  - **Each shared result** carries its owner's display name and the shared root it's reached through.
  - **Locations** start at that root: a folder above it is never named, and a parent above it is `null`.
  - **A shared album** lists only the shared lists it's in.
  - Nothing in Trash, revoked or merely opened appears; nothing is copied.
- **`GET /v1/search`** answers the new `shared` groups, limited per group like the others.
- **MCP's `search`** (AC-25's "App and MCP behave the same"): the person's albums, then shared albums, each with `sharedBy`, within `limit`.
- **The palette** (DS-75), changing TS-50's plan, as the creator decided on 29 October 2026:
  - Owned results stay on the device and instant.
  - A "Shared with me" group comes from the server, 150 ms after typing stops, while online:
    - folders, lists and albums;
    - each with "Shared by {name}" and its accessible path;
    - opening in the viewer page (`/shared/{root}?c=`).
  - "No results" waits for that answer.
  - Offline, the group says "Shared content isn't searched while offline."

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: shared content is searched, in the app and through MCP.

## Impact

- **`packages/domain`:** the shared result schemas.
- **`packages/db`:** `searchCollection()`.
- **`apps/api`:** the search route's answer, MCP's `search`, OpenAPI (response fields only).
- **`apps/web`:** the palette's shared group.
- **Docs:** TS-50 and DS-75, as built.
- **No schema change.**
