# Proposal

Linear: TON-41 (Feature). Tech: TS-41's MusicBrainz rate limit and cache, TS-90 and TS-91's MusicBrainz queue. It serves FR-02.1 (identifying a pasted link) and FR-06.7 (automatic metadata lookups that identify a supplied link), and keeps to TS-41's Spotify rules.

## Why

Identification (TON-42) and enrichment (TON-43) ask MusicBrainz several questions per pasted link. MusicBrainz allows 1 request per second per IP, asks for a meaningful User-Agent, and answers 503 at times even under the limit ([TON-14](../../../docs/spikes/2026-10-18-g1-musicbrainz.md)). A batch of 50 links must therefore queue, not fail. Asking again for the same URL, barcode or album shouldn't spend that budget.

Today only the G1 spike's client exists, in `tooling/`. It caches on disk and has no Spotify rules.

## What Changes

- **A MusicBrainz client** in `packages/providers`, through `safeFetch` (TS-103) with its User-Agent:
  - **One queue per process,** paced at 1 request per second start to start, shared by every lookup;
  - **503s, and 502s and 504s,** are retried with backoff, honouring `Retry-After`, and hold the whole queue back. When retries run out, the lookup fails as the provider being unavailable, so the job can retry later (TS-90);
  - **Identical lookups in flight** share one request.
- **The lookups TS-41's chain needs:**
  - the releases and release groups each of several URL forms is linked to, in one request (step 2);
  - releases whose barcode is exactly one of several forms (step 3);
  - a release or release group by MBID, with the includes enrichment asks for (TON-43);
  - searches for step 4's hints, which are never cached;
  - a release group's front artwork on the Cover Art Archive. That service is outside MusicBrainz's limit, so it isn't paced.
- **A 7-day cache** keyed by URL, barcode and MBID, kept in Postgres so it outlives a restart.
  - A miss is cached only when the caller says the key isn't Spotify-derived. A Spotify value's hit is kept under MusicBrainz's own barcode or URL (TS-41).
  - A daily schedule removes expired entries.
- **Errors and logs** never carry a lookup's query: barcodes and URLs stay out of messages (TS-41).
- **Docs:** TS-41's queue as built, with the scale-out path; the data model gains `provider_cache`; TS-91 gains the prune.

## Capabilities

### New Capabilities

- `metadata-sources`: how Tonaris asks MusicBrainz and the Cover Art Archive. It covers pacing, retries, caching, and the Spotify rules for what is cached. Later work on Spotify, iTunes Lookup and the store pages (TON-42) adds to it.

### Modified Capabilities

None.

## Impact

- **`packages/providers`:** `MusicBrainz`, the `ProviderCache` port with an in-memory version, and `ProviderUnavailableError`. It gains a `zod` dependency.
- **`packages/db`:** the `provider_cache` table and its migration, `providerCacheStore()`, and `pruneProviderCache()`.
- **`apps/api`:** the `prune-provider-cache` schedule.
- **No API, protocol or interface change.** The chain that calls the client is TON-42.
