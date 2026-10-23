# Proposal

Linear: TON-39 (Feature). Implements:
- FR-02.1, the link forms capture accepts from Spotify, Apple Music, Qobuz and Tidal;
- FR-02.3, unsupported input explained;
- FR-06.4, equivalent share-link variants of one release are the same link;
- Q-05, pasted text as untrusted input: parsed locally against an allowlist, never fetched, except short links.

Tech: TS-40. Builds on the G1 spikes' link samples (TON-14, TON-15, TON-16, TON-99, TON-100).

## Why

Capture (M3) starts at step 0 of the TS-41 chain: turning pasted text into `{service, kind, id}` and a canonical URL, or explaining why it can't. The resolver chain (TON-42) and service links (TON-46) both need it. Today only the G1 spike's parser exists, in `tooling/`. Tidal isn't yet a service the database accepts.

## What Changes

- **A link parser** in `packages/providers`, local and allowlisted (TS-40). It turns pasted text into the service, the kind (album or track), the id of what the link names, and a canonical URL, for:
  - **Spotify:** `open.spotify.com/(intl-xx/)?(album|track)/{id}`, with `si` and every other parameter dropped, and `spotify:(album|track):{id}` URIs;
  - **Apple Music:** `music.apple.com` and `geo.music.apple.com` album links, with or without a storefront or slug; `?i=` song links, whose album id is in the path; and `/song/` links, which name only the song (accepted by the creator on 24 October 2026);
  - **Qobuz:** `www.qobuz.com/{locale}/album/{slug}/{id}` store links, also without the locale, and `open.qobuz.com` and `play.qobuz.com` album and track links;
  - **Tidal:** `tidal.com`, `www.tidal.com` and `listen.tidal.com` album and track links, with or without `/browse`, with a share link's `/u` and `?u` dropped. Canonical: `https://tidal.com/(album|track)/{id}`.
- **What the parser keeps for the chain:** the album id when the link names it, the Apple storefront, and the Qobuz store locale and slug for request A (TS-41).
- **Short links** (`spotify.link`): the parser recognises them, and a resolver follows them with one `GET` per hop, manual redirects, at most 3 hops and every `Location` on the allowlist. It takes the fetcher as an argument, so production passes the SSRF-guarded `safeFetch` (TON-40).
- **Unsupported input** fails with `unsupported_link` and a reason for people (FR-02.3): not a link of the four services, a link that isn't an album or track, or an incomplete one. A short link that leads nowhere is unsupported too; one that can't be reached is `provider_unavailable`.
- **Equivalence** (FR-06.4): two links with the same service, kind and id are the same link, whatever their form.
- **Tidal joins the streaming services.** The list moves to `packages/domain`, which `packages/db` uses for `album_service_links.service`, so the check constraint gains `tidal`.
- **Docs:** TS-40 and TS-41 as built, with the `/song/` decision; DS-48's failure reasons.

## Capabilities

### New Capabilities

- `link-capture`: the link forms capture accepts and their canonical URLs, short links, unsupported input, and equivalent links. Later capture work (TON-42, TON-43) adds to it.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:** `streamingServices`, `linkKinds`, the service names, and `sameLink()`.
- **`packages/providers`:** `parseLink()` and `resolveShortLink()`, with a fixture table of real link variants.
- **`packages/db`:** `streamingServices` from the domain, and a migration widening `album_service_links_service_check` to `tidal`.
- **`tooling`:** the 5,000-album workload (TS-120) gives some albums Tidal links.
- **No API, protocol or interface change.** Capture's endpoint and popover come with TON-42 and TON-43.
