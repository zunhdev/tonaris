# Proposal

Linear: TON-42 (Feature). Implements:
- FR-02.1, identifying the album behind a pasted link;
- FR-02.2 and FR-02.3, track links, with Qobuz's now going to manual entry like Tidal's (decided by the creator on 24 October 2026);
- FR-02.4 and FR-02.5, manual entry prefilled when identification fails, and retryable provider failures;
- FR-06.7, automatic lookups that identify a supplied link;
- FR-10.5, agent captures reading no store pages.

Tech: TS-41's resolver chain as decided on 21 October 2026, with the Spotify, iTunes Lookup and store-page rules. Builds on TON-39 (parsing), TON-40 (`safeFetch`) and TON-41 (the MusicBrainz client).

## Why

Capture's promise (FR-02.1) is that a pasted link becomes the album it names. The pieces exist: links parse, outbound requests are guarded, and MusicBrainz is paced and cached. What doesn't exist is the chain that asks, in TS-41's order, until one album is certain. That chain is steps 1–5, with the Spotify bridge, the Apple, Qobuz and Tidal hints, and the strict step-4 rule the G1 spikes measured. Matching (TON-44), enrichment (TON-43) and the capture interface (TON-45) all start from its answer.

## What Changes

- **`identify()`** in `packages/providers` runs TS-41's chain for one pasted link. Its answer is one of:
  - linked to an album the owner already has (step 1, Trash included);
  - identified as a MusicBrainz album, a release group (steps 2–4);
  - several albums to choose from (TS-26);
  - unidentified, for manual entry with what is known (step 5);
  - failed: unsupported input, or a provider unavailable.
- **The steps:**
  - **step 2 asks for every URL form at once.** Apple's common storefronts, Qobuz's store URLs with the slug from request A, and Tidal's other forms. A `/song/` link's album comes from one iTunes Lookup;
  - **step 3** turns a Spotify UPC or a 13-digit Qobuz id into its 12-, 13- and 14-digit forms, exact matches only;
  - **step 4** uses Apple's iTunes Lookup and Qobuz's and Tidal's album pages, under the decided rule: exactly one official album or EP fits the cleaned title, an artist name and the year. Singles count when Apple's title says " - Single", and the cleaning keeps "(Taylor's Version)".
- **Track links:**
  - Spotify's find their album with `Get Track`;
  - Apple's from the path or iTunes Lookup;
  - Tidal's and Qobuz's go to manual entry with the link kept, after no request at all.
- **Provider clients:**
  - **iTunes Lookup,** paced under 20 requests a minute and cached for a day;
  - **Spotify's Web API** with client credentials, whose values live only in memory, with an off switch and a daily health check;
  - **Qobuz's and Tidal's album pages:** at most two requests per Qobuz link and one per Tidal link, `fr-fr` for open. and play. links, robots.txt checked daily, and nothing kept.
- **Agent captures** skip Qobuz's page and Tidal's entirely. Request A, which reads only `Location`, still runs.
- **Outcomes in TS-27's vocabulary:**
  - several albums → `needs_input` (`match`);
  - unidentified → `needs_input` with a new need, `details`, carrying the link and any Apple hints;
  - unsupported → `unsupported_link`;
  - unavailable → `provider_unavailable`.
- **Step 1's store:** `findLinkedAlbum()` in `packages/db`, matching `album_service_links` by owner, service and entity id. The entity id is the album's id when the link names one, else `track:{id}`.
- **Docs:**
  - PRD: FR-02.3, AC-06, section 8 and the change log, for Qobuz track links;
  - TS-41 and the data model as built;
  - TS-27's input needs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: gains identification. It covers the chain's order, track links, the step-4 rule, choices between albums, manual entry with what is known, and agent captures.
- `metadata-sources`: gains the Spotify, iTunes Lookup and store-page rules.

## Impact

- **`packages/providers`:**
  - `identify()`, the step-4 rule and title cleaning;
  - URL and barcode forms;
  - `ItunesLookup`, `Spotify`, `StorePages`, and a shared paced queue;
  - recorded fixtures under `packages/providers/fixtures/identify/`, with their recorder.
- **`packages/domain`:** `inputNeeds` gains `details`, and `linkEntityId()`.
- **`packages/db`:** `findLinkedAlbum()`.
- **`apps/api`:**
  - the Spotify settings in its config (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_BRIDGE`);
  - the providers it composes;
  - the `spotify-health` schedule;
  - the regenerated OpenAPI document. The new enum value is additive (TS-09).
- **No interface change.** The capture command and popover come with TON-44 and TON-45.
