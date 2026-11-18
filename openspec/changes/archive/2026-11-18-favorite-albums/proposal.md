# Proposal

## Why

The creator wants a profile to say something about a person's taste: up to four favorite albums from their own collection, beside the About text. Linear: TON-297, the last step of People and profiles (P-TON-57). Rules: FR-11.16, FR-08.4, DS-93, DS-121, TS-135.

## What Changes

- **Settings → Profile** gains Favorite albums: up to four of your own albums, each found by typing its title or artist, reordered with ↑ and ↓, and removed (`account.setFavorites`, app-only).
- **Your people see them** on your page in their People, as the cover, title and artist only: never the album's year, links, fields, lists or place. The same people see your About text (TON-296); guests, the Shared by card, exports and MCP never do.
- **Trash:** a favorite in Trash is hidden, comes back in its place when restored, and is gone for good when purged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: favorite albums on the profile.
