# Proposal

Linear: TON-43 (Feature). Implements:
- FR-02.8, chronology and classification from the canonical source, filled only where it is reliable;
- FR-02.12, the album's canonical title and original year, and its identity as MusicBrainz's release group;
- FR-03.3, enrichment that fills gaps only, and FR-03.4's "enrichment keeps an existing URL";
- FR-05.9, the classification mapping, with live singles Unclassified (decided by the creator on 24 October 2026);
- FR-08.8, provenance and the policy flags derived from it.

Tech: TS-15, TS-42, TS-44 (changed release group ids, decided 21 October 2026), TS-45 and TS-46. Builds on TON-41 (the MusicBrainz client) and TON-42 (identification).

## Why

Identification (TON-42) answers which MusicBrainz album a link names, but nothing turns that answer into album data yet. Capture (TON-44, TON-45) needs the album's title, artist, year, classification and recording years from MusicBrainz, written so that nothing a person entered is ever overwritten (FR-03.3). Saved albums also need to keep their identity when MusicBrainz merges or deletes release groups, which the G2 spike found in its corpus.

## What Changes

- **What MusicBrainz says about an album.** `describeAlbum()` in `packages/providers` asks for a release group and answers its facts:
  - the release group's title and artist credit, and its first release year (FR-02.12);
  - its classification, mapped by TS-45. Single, Broadcast and Other stay Unclassified whatever their secondary types, so a live single isn't Live (decided 24 October 2026);
  - for a live album, recording years from the dated "recorded at" and "recorded in" relationships of its first official release's recordings, falling back to the event's `life-span` (TS-46);
  - the release group's Cover Art Archive front;
  - the id MusicBrainz answered under, which differs from the asked one after a merge. A 404 means the release group was deleted.
- **The fill rule.** `planEnrichment()` in `packages/domain` decides what a saved or new album takes from those facts (TS-42):
  - only missing values are filled. Populated values, a person's or an earlier source's, are kept, including a conflicting classification (FR-03.3);
  - the recording range is filled as a unit, and only for an album that is live;
  - a merged release group id is replaced by the new one, and a deleted one leaves the album unidentified, with its data (TS-44).
- **Provenance and policy.**
  - Every filled value records its source (`musicbrainz` or `coverartarchive`), the MBID it came from, and when it was retrieved (TS-15).
  - A person's create or edit records `user` for the values they wrote, so Apple's hints stop being `itunes-lookup` once edited.
  - `packages/providers/src/policy.ts` holds the versioned policy map and `filterFields()`, which replaces a withheld value with `{"withheld": "provider-policy"}` (FR-08.8). No current source withholds anything.
- **Writing it.** `enrichAlbum()` in `packages/db` applies the plan under the owner's write lock. Filled values reach the owner's sessions as an album change, with no mutation id. The API composes `enrich()` from the providers, the database and the change hub, for the capture job to call.
- **Docs.** The PRD records the live-single decision under FR-05.9. TS-15, TS-42, TS-44, TS-45 and TS-46 are updated as built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: gains enrichment: filling gaps only, the canonical title and year, classification, recording years, provenance with policy flags, and changed release group ids.
- `metadata-sources`: gains what enrichment asks of MusicBrainz and the Cover Art Archive, and how their failures are treated.

## Impact

- **`packages/domain`:**
  - `enrichment.ts`: provenance sources, the facts' type, `planEnrichment()` and the blank album capture starts from;
  - `provenanceSources` moves here from `packages/db`.
- **`packages/providers`:**
  - `album-facts.ts`: `describeAlbum()`, `classify()` and `recordingYears()`;
  - `policy.ts`: the policy map and `filterFields()`;
  - recorded fixtures under `packages/providers/fixtures/describe/`, with their recorder.
- **`packages/db`:**
  - `enrichAlbum()` and `albumReleaseGroup()`, and `albumProvenance()` in `provenance.ts`;
  - the account lock and change logging, shared with `executeMutation()`;
  - `user` provenance written by album creates and edits.
- **`apps/api`:** `createProviders()` gains `enrich()`, given the hub.
- **No schema change, no API change, no interface change.** `album_provenance` and the album's MBID and artwork columns exist since TON-5 and TON-27. Clients' album records keep their fields: artwork reaches them with the image proxy (TON-48).
