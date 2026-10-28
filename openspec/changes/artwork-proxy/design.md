# Design

## Context

- **`albums.artwork_url`** exists. Enrichment (TON-43) fills it from the Cover Art Archive (CAA) with provenance `coverartarchive`, but client records leave it out.
- **`safeFetch`** (TON-40) already does what the proxy needs: public https hosts only, every hop checked, 5 s, 5 MB, and `contentTypes`.
- **The web CSP** already allows `img-src 'self' data: <api origin>`. The API's responses carry `default-src 'none'` and `nosniff`.

## Goals / Non-Goals

**Goals:** TS-103's proxy, artwork on clients, FR-03.4's editing, and DS-23's tile for anything missing.

**Non-Goals:** guest pages (M7), resizing, a live preview before saving, and server-side image caching beyond HTTP caching.

## Decisions

### 1. The record

- **`artworkUrl`** joins `albumFieldsSchema`: nullable, at most 2,048 characters.
  - `albumProblem()` refuses one that isn't an https URL on the default port without credentials: "Give the artwork as an https link, such as https://example.com/cover.jpg."
  - The proxy checks the host and the answer each time it fetches.
- **It is one compare-and-set field** like the others (TS-21), so a person's value records `user` provenance, and enrichment fills it only when null (TS-42).
- **Enrichment's fields are now the album's fields,** so capture's created albums carry the CAA artwork in their values.

### 2. Signing

- **The key:** HMAC-SHA256 of `tonaris:image-proxy:v1` under `BETTER_AUTH_SECRET`. It is derived for this one use, so a deploy needs no new secret, and rotating the auth secret rotates image paths.
- **The signature:** HMAC-SHA256 of the URL under that key, base64url, cut to 22 characters (128 bits).
- **Where:** the API adds `artworkSignature` to albums as it sends them: the bootstrap, and change events on the stream. Change rows store the album without it.
- **The path:** `artworkPath(url, signature)` in the domain: `/img/{signature}/{base64url(UTF-8 url)}`. Clients add the API origin.

**Alternative rejected:** `/img/{albumId}` looked up in the database. Guests would need authorization per album (M7), while a signature is a capability on its own, as TS-103 decided.

### 3. The proxy

`GET /img/:signature/:encoded`, outside `/v1` and the OpenAPI document:
1. **Check:** the segment must be base64url that round-trips, and the signature must match in constant time. Otherwise 404, with nothing fetched.
2. **Fetch:** `safeFetch` with `contentTypes` JPEG, PNG, WebP, GIF and AVIF. SVG is refused, since it can carry scripts.
3. **Answer:** the bytes and their type, with `Cache-Control: public, max-age=604800, immutable`, since a path names one URL for good. Any failure is a bodiless 404 with `no-store`.

### 4. The web app

- **`artworkSrc(album)`:** `apiUrl + artworkPath(...)` when the album has a URL and a signature.
- **Where it shows:** rows, cards and the inspector pass it to `Artwork`. The inspector names it "Cover of {title}" (DS-23); elsewhere it stays decorative.
- **`Artwork` remembers** which source loaded or failed, so replaced artwork loads afresh. A failure removes the image and keeps the tile.
- **Editing:**
  - manual entry has "Artwork URL" with "https://…", checked like the other fields;
  - the inspector has the same field under the artwork in Editing mode, saving on Enter or when left.

## Risks / Trade-offs

- **[The auth secret rotates]** → Artwork paths change, so browsers fetch them again. Nothing breaks.
- **[A heavy page of artwork]** → Each image is one proxied fetch per browser cache miss. HTTP caching, and a CDN if the creator adds one (TS-103), absorb repeats.
- **[A URL that becomes a tracking pixel]** → Only the API fetches it, never a viewer, so it learns nothing about them.
