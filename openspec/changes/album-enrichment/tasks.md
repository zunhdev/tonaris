# Tasks

## 1. The rule

- [x] 1.1 Add `packages/domain/src/enrichment.ts`: `provenanceSources` (moved from `packages/db`), the facts' type, `blankAlbum` and `planEnrichment()` (design decisions 2 and 6). Verify with `enrichment.test.ts`:
  - a person's values kept and gaps filled, a conflicting classification kept, enriching again planning nothing, artwork kept or added, missing facts left unknown (specs: a person's values are kept; a conflicting classification is kept; enriching again changes nothing; artwork kept or added; missing facts stay unknown);
  - a blank album taking the release group's title, artist and year (spec: a deluxe edition's album);
  - the recording range as one value, and none for an album the owner says isn't live (spec: an album the owner says isn't live);
  - provenance entries for each filled value (spec: enrichment's sources);
  - identities `set`, `merged`, `deleted`, `unchanged` and `elsewhere` (specs: a merged release group; a deleted release group).

## 2. Providers

- [x] 2.1 Add `classify()` and `recordingYears()` in `packages/providers/src/album-facts.ts` (design decisions 4 and 5). Verify with unit tests: the TS-45 table, including a live compilation, a live single and no types; place, area and event dates, the event fallback, and no dates (specs: a live compilation; a live single; no types; a recording dated only through its event; no recording dates).
- [x] 2.2 Add `describeAlbum()` (design decision 3).
- [x] 2.3 Add the fixture cases, their recorder (`packages/providers/fixtures/describe/record.ts`), and record `recorded.json` (design decision 11).
- [x] 2.4 Verify `describeAlbum()` with `album-facts.test.ts` on the recording:
  - *Bleach*'s title, artist, 1989, Album and front (spec: a deluxe edition's album);
  - *The Köln Concert* 1975 and *Live/1975–85* 1975–1985 from their first official releases (specs: a concert recorded on one night; a live album recorded over years);
  - a single Unclassified;
  - the merged id answered under its new id, and the deleted one (specs: a merged release group; a deleted release group);
  - the requests: one MusicBrainz lookup for a studio album, two for a live one, none again from the cache (specs: a studio album; a live album; the same album again within 7 days);
  - no front, the archive down, and MusicBrainz busy (specs: artwork kept or added; the Cover Art Archive is down; MusicBrainz stays busy).
- [x] 2.5 Add `packages/providers/src/policy.ts` (design decision 9). Verify with tests: every current source passes for agents and exports, and a policy that withholds a source marks its values (specs: nothing is withheld today; a withheld value is marked).

## 3. Database

- [x] 3.1 Extract `lockAccount()` and `logChanges()` from `executeMutation()`. Verify with the existing `sync.test.ts`.
- [x] 3.2 Write `user` provenance in the store's `insertAlbum()` and `updateAlbum()` (design decision 8). Verify with a test: a created album's values are `user`; an edit of an enriched value makes it `user`, and clearing a value removes its entry (spec: an edit is the person's).
- [x] 3.3 Add `enrichAlbum()`, `albumReleaseGroup()` and `albumProvenance()` in `packages/db/src/enrichment.ts` (design decision 7). Verify with integration tests:
  - gaps filled with their provenance, a person's values kept, and one album change logged with no mutation id (specs: a person's values are kept; enrichment's sources);
  - enriching again logging nothing (spec: enriching again changes nothing);
  - artwork filled without a logged change;
  - the merged id stored, and the deleted one cleared with the data kept (specs: a merged release group; a deleted release group);
  - another owner's album `not_found`.

## 4. API

- [x] 4.1 Add `enrich()` to `createProviders()`, given the hub, and pass the hub in `index.ts` (design decision 10). Verify with a test: an enriched album's change is published to the owner's hub; MusicBrainz unavailable writes and publishes nothing (spec: MusicBrainz stays busy).

## 5. Docs

- [x] 5.1 Update the PRD's FR-05.9 and change log with the live-single decision of 24 October 2026.
- [x] 5.2 Update `docs/tech-spec.md` as built: TS-15 (the policy map, `filterFields()`, `user` provenance, field names), TS-42 (the plan, the recording range as one value), TS-44 (merged and deleted ids at enrichment), TS-45 (the table with singles' secondary types) and TS-46 (the first official release, the 25-release lookup). Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate album-enrichment --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `album-records` and `metadata-sources`, and that `openspec validate --all --strict` passes.
