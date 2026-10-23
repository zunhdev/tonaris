# Tasks

## 1. Shared pieces

- [x] 1.1 Extract `PacedQueue` from `MusicBrainz` (design decision 1). Verify with the existing `musicbrainz.test.ts` and a `paced-queue.test.ts`.
- [x] 1.2 Add `linkEntityId()` to the domain and `details` to `inputNeeds`, and regenerate the OpenAPI document (design decisions 2 and 3). Verify with `links.test.ts` and `bun run openapi:check`.
- [x] 1.3 Add `findLinkedAlbum()` to `packages/db`. Verify with a test: a link of the owner's album is found by service and entity id, Trash included, and another owner's isn't (spec: a link already saved).

## 2. Providers

- [x] 2.1 Add `link-forms.ts`: step 2's URL forms and step 3's barcode forms (design decision 3). Verify with unit tests per service.
- [x] 2.2 Add `hints.ts`: title cleaning, the search and the rule (design decision 4). Verify with unit tests: cleaning keeps "(Taylor's Version)" and drops "(Standard)", " - EP", " - Single" and "(feat. …)"; artist names, sort names and years; official albums and EPs, and singles after " - Single".
- [x] 2.3 Add `ItunesLookup` (design decision 6). Verify with tests: 3 s pacing, a day's cache of the trimmed values, songs giving their album (spec: a batch of Apple links).
- [x] 2.4 Add `Spotify` (design decision 7). Verify with tests: the token reused, 429 waits, 404 as none, nothing cached, errors without ids.
- [x] 2.5 Add `StorePages` (design decision 5). Verify with tests on synthetic pages:
  - request A's `fr-fr` URL, reading only `Location`; request B; at most two Qobuz requests and one Tidal request (spec: an open.qobuz.com link);
  - robots.txt read once a day and obeyed (spec: robots.txt disallows album pages);
  - hints extraction.

## 3. The chain

- [x] 3.1 Add `identify.ts`: `createIdentifier()`, `identify()` and `identificationOutcome()` (design decisions 2 and 3).
- [x] 3.2 Add the fixture cases, their recorder (`packages/providers/fixtures/identify/record.ts`), and record `recorded.json` (design decision 8).
- [x] 3.3 Verify with `identify.test.ts` on the recording:
  - each step's case (specs: a link already saved; a link MusicBrainz knows; a barcode MusicBrainz knows; hints that fit one album);
  - track links: an Apple `/song/` link, and Qobuz and Tidal track links making no request (specs: an Apple Music song link; a Qobuz track link);
  - step 4: *The Last in Line* ambiguous, *Idéal* the album not the single, the *Nutcracker* remaster unidentified, *Red (Taylor's Version)* (specs: two albums fit; a single of the same name; the year rules out a different recording; a re-recording);
  - several albums from step 2 (spec: a URL linked to two albums);
  - unidentified answers with and without prefill, and MusicBrainz unavailable (specs: an Apple link MusicBrainz lacks; a Tidal page MusicBrainz can't match; MusicBrainz unavailable);
  - agent captures (specs: an agent adds a Qobuz link; an agent adds a Tidal link);
  - Spotify values never kept or returned, and the bridge off (specs: a Spotify track MusicBrainz lacks; the bridge turned off);
  - the outcomes in TS-27's vocabulary.

## 4. API

- [x] 4.1 Add the Spotify settings to the API's config and `.env.example`, `apps/api/src/providers.ts`, and the `spotify-health` schedule (design decisions 7 and 9). Verify with config tests and a schedule test: a refused token is logged without values (spec: the Premium subscription lapsed).

## 5. Docs

- [x] 5.1 Update `docs/tech-spec.md`: TS-41 as built (step 1's entity ids, the forms, the rule's cleaning, store-page pacing and robots, iTunes and Spotify clients, agent captures), TS-27's `details` need, and the data model's `entity_id`. Update DS-48 with the reasons as built in TON-42. The PRD's Qobuz track decision is already in. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate identification-chain --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `link-capture` and `metadata-sources`, and that `openspec validate --all --strict` passes.
