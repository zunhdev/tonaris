# Proposal

Linear: TON-48 (Feature). Implements:
- FR-03.4, artwork entered or replaced by hand, kept by enrichment, and never blocking an album;
- Q-05, artwork that never reveals a viewer to a third party nor loosens the CSP.

Design: DS-23. Tech: TS-103. Done when the strict CSP holds (`img-src` only self and the API), pages never contact the artwork's host, and broken artwork shows the fallback tile.

## Why

Enrichment saves Cover Art Archive artwork since TON-43, but no client sees it: albums show their letter tile. Loading artwork straight from its host would break the CSP and tell that host who looks at the collection, guests included. TS-103 decided a signed image proxy on the API host.

## What Changes

- **Albums carry their artwork URL** (`artworkUrl`) on client records. It must be an https link (FR-03.4).
- **`album.setArtwork {id, artworkUrl}`,** with `base.artworkUrl`, sets or clears it (TS-21). `album.create`, `album.update` and capture's details keep their request shapes, so no client's write breaks (TS-09).
- **The API signs it** when it sends an album, in the bootstrap and on the stream: `artworkSignature`, 128 bits of HMAC-SHA256 under a key derived from the auth secret. The database never stores it.
- **`GET /img/{signature}/{base64url(url)}`** on the API host serves the artwork if the signature matches.
  - It fetches through `safeFetch`, raster images only, and caches a week, immutable.
  - Anything else is a bodiless 404.
- **The web app** shows artwork from the proxy in rows, cards and the inspector, where it is "Cover of {title}". A failed or missing image keeps the fallback tile (DS-23).
- **Editing:** manual entry and the inspector, in Editing mode, take an artwork URL.
- **Enrichment's artwork reaches clients:** filling it is now a change they receive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: gains artwork: an editable URL, shown only through the image proxy, with the tile when missing or failed.

## Impact

- **`packages/domain`:**
  - `artworkUrl` on `albumSchema`, the record, and `albumCreateArgsSchema` for `album.create`'s unchanged arguments;
  - `album.setArtwork` and its command, with `isArtworkUrl()`;
  - `artworkPath()`;
  - `syncedAlbumSchema` for the bootstrap and album changes;
  - enrichment's artwork reaching clients.
- **`packages/db`:** albums' `artwork_url` in client records, and the memory store keeping it on the album.
- **`apps/api`:**
  - `artwork.ts`: the signer, presenting albums, and the `/img` route;
  - the bootstrap and stream present albums;
  - the browser-test image host.
  - The OpenAPI document is regenerated; the changes are additive.
- **`apps/web`:** `artworkSrc()`, the Artwork component's label, the inspector's and form's artwork URL fields, the albums collection sending `album.setArtwork`, and its description, retry and dependency.
- **No schema change:** `albums.artwork_url` exists.
- **Not here:** guest pages (M7), which will show artwork the same way; resizing (TS-103: none in v1); and a live preview of a URL not yet saved.
