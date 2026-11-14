# Proposal

## Why

DS-27, DS-31 and DS-41 promise a small glyph on the owner's own shared folders and lists: people, a link, or both, dimmer when the sharing comes from a folder above. It was put off for M7 and never built, so owners can't see at a glance what they share. The creator decided on 14 November 2026 to build it (TON-225, DRIFT-071). Linear: TON-227.

## What Changes

- `GET /v1/sharing` lists what the person shares themselves: each of their folders and lists outside Trash with a pending or accepted invitation, or a link that is on, saying which.
- The sidebar tree, folder rows and folder cards show a glyph after the name: people, a link, or both, in `fg.tertiary`. A folder or list shared only through a folder above shows the same glyph at half strength, with the kinds of every folder above that shares.
- Its words, "Shared by link", "Shared with people", "Shared with people and by link", with "through a folder above" when inherited, are its tooltip and are read after the name.
- The app reads the list when a glyph first shows, after each change in the sharing dialog, and when the window comes back into view. Moves change the dimmer glyphs at once, as the tree knows them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: owners see what they share, in the tree and their folders.
