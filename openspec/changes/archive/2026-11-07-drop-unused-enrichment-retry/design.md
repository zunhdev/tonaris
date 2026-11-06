# Design

## Drop, not build

The issue offered two paths, and the creator chose to drop the unused pieces (7 November 2026). A retry job needs an album that was saved without MusicBrainz's facts but with a release group. Capture never makes one: it asks MusicBrainz before the write lock, and an unavailable answer ends the capture as `provider_unavailable` with nothing saved. A manual entry is saved with no release group (FR-02.4).

## What covers FR-03.3 now

`captureAlbum` plans with `planEnrichment()` for a new album and for a reused one, and `store.fillAlbum` writes the plan under the owner's lock. `packages/domain/src/capture.test.ts` covers the reuse fill, kept values, merged ids (TS-44) and the agent's details. `packages/domain/src/enrichment.test.ts` covers the plan itself. The AC-10 evidence cites these.

## If a later feature needs it

Re-enriching albums on demand would need its own rule, such as which albums and how often. It would start from `planEnrichment()`, not from the removed wrapper.
