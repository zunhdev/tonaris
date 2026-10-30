# Design

## Context

- **Artwork today** comes from enrichment (the Cover Art Archive's front for the album's release group) or from a URL the owner types (FR-03.4). An album with no release group gets nothing unless the owner finds an image elsewhere.
- **Other services' covers are ruled out** by their terms (TON-17): Spotify's content may not be used outside Spotify, Apple's album art only promotes its store, and Tidal's and Qobuz's pages may only be read to identify a pasted link.
- **The image proxy** shows only URLs the server signed (TS-103).

## Goals / Non-Goals

**Goals:** a few clicks from an album without artwork to a Cover Art Archive cover the owner recognizes.

**Non-Goals:**
- matching the album to MusicBrainz, or filling its other values;
- other image sources;
- searching from MCP. Agents can already set an artwork URL.

## Decisions

### 1. Search release groups by title and artist

`findCovers` asks MusicBrainz's release-group search for the title and the first artist, as step 4's search does, with its title cleaning. When the artist finds nothing, as with a transliterated name, it asks by title alone. It keeps the first 8 release groups in MusicBrainz's order, and asks the archive for each one's front, in parallel. The archive isn't under MusicBrainz's limit, and each answer is kept 7 days.

### 2. The owner chooses by eye

The search is loose on purpose: the owner sees each cover with its album's title, year and type, and picks one. Nothing is chosen for them, so a loose search can't save a wrong cover.

### 3. Choosing is an ordinary artwork edit

The chosen cover's `front-500` address is saved as the artwork URL, with `album.setArtwork` in the inspector, or as the form's Artwork URL value. Its source is `user`, as for a pasted URL: the owner chose it. No new mutation is needed, and the request contract stays as it is (TS-09).

### 4. The route signs what it answers

`GET /v1/artwork/covers?title=&artist=` answers each cover with `artworkSignature`, as album records carry, so the popover shows it through the proxy. The chosen URL is signed again when the album comes back on the stream.

### 5. Failures

- MusicBrainz unavailable: `503 provider_unavailable`, and the popover offers Try again.
- The archive unavailable for every candidate: the same. One that fails while others answer is left out.
- No candidate with a front: an empty list, and the popover says nothing was found.

## Risks / Trade-offs

- **Each search takes one or two of MusicBrainz's one-a-second slots,** shared with captures. The search runs only when the owner asks.
- **Albums the archive lacks** still need a pasted URL.
