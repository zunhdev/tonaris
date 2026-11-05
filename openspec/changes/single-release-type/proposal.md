# Proposal

Linear: TON-164 (Feature). Changes FR-02.3, FR-02.8, FR-05.7 and FR-05.9 (TS-45, DS-43). Done when capturing a single gives an album of type Single in a Single group, and Single can be chosen in the album panel and the New album form and set by agents.

## Why

In the creator's manual testing (5 November 2026), while fixing TON-163: singles can be in a collection, but they get no release type and show under Unclassified (decided 17 and 24 October 2026). The creator wants singles supported fully, no different from EPs.

## What Changes

- **Single is a release type,** beside Album, EP and Compilation, chosen in the album panel and the New album form, set by agents, and exported as `single`.
- **Capture classifies singles** from MusicBrainz as it does EPs: Single → Single, a compilation single → Compilation, a live single → live.
- **Grouping gains a Single group** after EP: Album, EP, Single, Live, Compilation, Unclassified.
- **Singles saved earlier keep no type** until someone sets Single; nothing reclassifies them (the creator's choice).
- **The API changes in place:** the album mutations' and responses' `releaseType` gain `single`. No one uses the API yet, so there are no new mutations and no new version. CI's breaking-change check gets one-time entries for it, and TON-131's leftover entries are removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: Single is a release type; classification maps MusicBrainz's Single to it.
- `views-and-ordering`: grouping by release type gains a Single group after EP.

## Impact

- **`packages/domain`:** `releaseTypes`, `releaseGroups` and `groupNames`, the export's types and readme.
- **`packages/providers`:** `classify()`.
- **`packages/db`:** the `albums.release_type` check constraint, with a migration.
- **`apps/api`:** the OpenAPI document (regenerated), MCP tool descriptions, `oasdiff-ignore.txt`.
- **`apps/web`:** the type pickers follow `releaseTypes`; grouping follows `releaseGroups`.
- **Docs:** PRD FR-02.3, FR-05.7, FR-05.9, glossary and change log; DS-43 and DS-45's chronology; TS-45 and the data model.
