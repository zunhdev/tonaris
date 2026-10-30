# Proposal

Linear: TON-112 (Feature). Implements FR-03.4. Design: DS-23, DS-46, DS-47. Tech: TS-41, TS-103. Done when an album without artwork can get a Cover Art Archive cover in a few clicks, from the inspector or the manual entry form.

## Why

In the creator's manual testing (30 October 2026), albums saved without a MusicBrainz match had no artwork, and the only fix was pasting an image URL found elsewhere. Spotify's, Apple's, Tidal's and Qobuz's covers aren't options: their terms rule them out (TON-17). The Cover Art Archive's are the ones Tonaris already shows.

## What Changes

- **"Find artwork"** next to the Artwork URL field, in the inspector (Editing mode) and in the manual entry form.
- **It searches MusicBrainz** for albums by the album's title and artist, and asks the Cover Art Archive which of them have a front cover.
- **A popover shows the covers found**, each with its album's title, year and type, through the image proxy. Choosing one sets the artwork URL to the archive's stable `front-500` address, as any artwork edit does.
- **Artwork only:** choosing a cover doesn't match the album to MusicBrainz or change another value.
- **Nothing found,** and MusicBrainz or the archive unavailable, say so; offline, the button is disabled.
- **`GET /v1/artwork/covers`** answers the search for a signed-in person, through MusicBrainz's queue.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: owners find artwork on the Cover Art Archive.

## Impact

- **`packages/providers`:** `findCovers`, the release-group search and the archive's fronts.
- **`apps/api`:** the covers route, wired from the providers, with a fixture finder for tests; OpenAPI gains one endpoint.
- **`apps/web`:** the Find artwork popover, in the inspector and the manual entry form.
- **Docs:** FR-03.4, DS-46 and DS-47 as built, TS-41.
