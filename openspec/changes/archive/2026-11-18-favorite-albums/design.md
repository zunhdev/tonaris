# Design

## Context

TON-296 added the avatar color and About text (TS-135), with the About read through `GET /v1/people/{id}` only for the person's people from their side. Albums carry their artwork URL; the API signs it for the image proxy (TS-103). The client holds only the person's active albums.

## Decisions

- **`profile_favorites (user_id, album_id, position)`,** positions 0 to 3, one row an album. The album's foreign key cascades, so a purge removes it; account deletion deletes the person's rows before the account (TS-74).
- **`account.setFavorites {albumIds}`** replaces the list in order: at most 4, no repeats, each the person's own album, in Trash or not, so a hidden favorite keeps its place. Anything else is `not_found`, the same for someone else's album and a missing one. App-only.
- **`GET /v1/me/favorites`** gives the person their own in order, with `trashed` and signed artwork, since the client holds no albums in Trash.
- **`GET /v1/people/{id}`** gains `favorites`: the person's albums outside Trash, in order, as `title`, `artistCredit`, `artworkUrl` and `artworkSignature` only, when the caller is one of their people from their side; else empty (the creator's choices on 18 November 2026: cover, title and artist only, on the person's page only).
- **Settings → Profile:** "Favorite albums" under About lists them with ↑, ↓ and Remove, an album in Trash marked as such; **Add a favorite…** (under four) opens a dialog with "Find an album", the finder of "Add to a list" (DS-115), matching each typed word against the title or artist and offering the person's albums not already favorites, at most 50.
- **A person's page** shows "Favorite albums" under the About text: up to four covers, each with its title and artist under it.

## Risks

- A favorite's cover URL reaches the person's people, as a shared album's does its viewers.
