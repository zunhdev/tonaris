# Tasks

## 1. Client

- [x] 1.1 Add `ProviderCache`, `memoryCache()` and `ProviderUnavailableError` to `packages/providers`, and `zod` as its dependency (design decision 5).
- [x] 1.2 Add `MusicBrainz` in `packages/providers/src/musicbrainz.ts`: the queue, retries, in-flight sharing, the lookups and the caching rules (design decisions 1–4). Verify with `musicbrainz.test.ts`:
  - 50 lookups at once start a second apart with the User-Agent (spec: a batch of 50 lookups);
  - the same batch again sends nothing, expiry after 7 days, duplicates share a request (specs: the same batch again; after 7 days; duplicates in a batch);
  - a Spotify miss keeps nothing, and a Spotify hit is kept under MusicBrainz's barcode and answers next time (specs: a Spotify barcode MusicBrainz lacks; a Spotify barcode MusicBrainz has);
  - two 503s then an answer, with growing waits, `Retry-After` and the queue held back; a lasting 503 failing as unavailable with no query in the message (specs: two 503s, then an answer; MusicBrainz stays busy);
  - the Cover Art Archive's redirect, 404 and 5xx (specs: a release group with a front; a release group without one).

## 2. Storage

- [x] 2.1 Add the `provider_cache` table with its migration, and `providerCacheStore()` and `pruneProviderCache()` to `packages/db` (design decision 5). Verify with `provider-cache.test.ts`: get and set, expiry, upsert, prune, and the migrations test's table list.
- [x] 2.2 Add the `prune-provider-cache` schedule in `apps/api`. Verify with `apps/api/src/provider-cache.test.ts`: the client answering from Postgres without a second request, and the schedule removing expired entries.

## 3. Docs

- [x] 3.1 Update `docs/tech-spec.md`. TS-41's rate-limit bullets get the queue as built, its retries, the caching rules and the scale-out path. The data model gains `provider_cache`. TS-90's schedules note and TS-91 gain the prune. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 4.2 Run `openspec validate musicbrainz-client --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive creates `metadata-sources`, and that `openspec validate --all --strict` passes.
