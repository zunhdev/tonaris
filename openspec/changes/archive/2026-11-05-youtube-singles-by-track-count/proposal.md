# Proposal

Linear: TON-163 (Feature). Changes how a YouTube Music link is identified (FR-02.1, FR-02.12; TS-41 step 4). Done when the YouTube Music link of Tool's single *Opiate²* is identified as that single, while an album playlist still isn't taken for its namesake EP or single.

## Why

In the creator's manual testing (5 November 2026), the YouTube Music link of Tool's single *Opiate²* went to manual entry, though MusicBrainz has the single. MusicBrainz has no YouTube link for it, so step 2 finds nothing. YouTube's hints fit the single's digital release exactly: title, artist, date and its 1 track. But step 4 counts singles only when Apple's title says " - Single", and YouTube titles the playlist "Album - Opiate²". No YouTube Music single can be identified this way.

## What Changes

- **YouTube Music hints match singles too:** official singles count, besides albums and EPs, when the hints carry the playlist's track count. Only YouTube's hints carry one.
- **The track count still decides:** a match still needs a release with the playlist's track count. That check is what keeps an album playlist from matching a single or EP of the same name and year, the reason singles were left out.
- **Other hints are unchanged:** Qobuz, Tidal, Apple without " - Single", and an agent's details still match only albums and EPs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: YouTube Music's hints count official singles too, still needing a release with the playlist's track count.

## Impact

- **`packages/providers`:** `passes()` in `hints.ts`; tests in `hints.test.ts` and an identification case in `fixtures/identify/cases.ts` with recorded MusicBrainz answers.
- **Docs:** TS-41's step 4 and YouTube Music sections in `docs/tech-spec.md`.
- **Not re-measured** on the YouTube spike's labelled links: its harness has no track-count rule.
