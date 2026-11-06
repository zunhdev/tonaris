# Proposal

Linear: TON-149 (Feature). Corrects TS-42 and FR-03.3's retries and newly matched links. Done when no code or spec describes an enrichment job that does not exist.

## Why

TS-42 said a capture's retries and newly matched links enrich saved albums through `createEnricher` / `providers.enrich`, run by the capture's job (TS-90). That job was never built, so nothing in production called the enricher or `enrichAlbum`. The TON-147 code review found it.

Building the job would have nothing to do. A capture that can't reach MusicBrainz saves nothing and fails as `provider_unavailable`. A manually entered album has no release group to ask about. So no path saves an album a retry could enrich.

The cases the rule names already enrich, inside the capture itself. A person's Retry sends the capture again, and a link from another service matches the saved album. In both, the command fills the album's gaps under the write lock (`planEnrichment`, TS-42, TS-44).

## What Changes

- **Removed:** `createEnricher` and `providers.enrich` in the API, and `enrichAlbum` and `albumReleaseGroup` in `packages/db`, with their tests. `planEnrichment` stays: capture uses it.
- **Corrected:** TS-42, TS-44, TS-90's notes and the album-records and metadata-sources specs say enrichment happens when a capture saves or matches an album. No separate job is promised.
- **Unchanged:** FR-03.3 in the PRD. A person's Retry and a newly matched link are captures, and they fill gaps only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: enrichment happens in a capture, a retry or a link from another service included.
- `metadata-sources`: an unreachable MusicBrainz fails the capture and writes nothing, rather than failing a queued enrichment.

## Impact

- **`apps/api`:** `providers.ts` loses the enricher; `providers.test.ts` loses its tests.
- **`packages/db`:** `enrichment.ts`, `enrichment.test.ts` and the exports go.
- **Docs:** TS-42, TS-44, TS-90 and the acceptance walkthrough's AC-10 evidence as built.
