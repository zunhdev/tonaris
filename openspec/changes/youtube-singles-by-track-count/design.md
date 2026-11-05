# Design

## Context

Step 4's rule is `passes()` in `packages/providers/src/hints.ts`. It takes official releases whose album is an Album or an EP, and a Single only when the hint's title ends in " - Single", which only Apple's does. `Hints.tracks` is set only by `YouTubeData.albumHints()`, and when it is set, a passing release must have that many tracks (TON-131). Singles were left out because an album and a single of the same name and year both passed (Trust's *Idéal*, the G2 and Qobuz spikes), and those hints had no track count to tell them apart.

## Goals / Non-Goals

**Goals:**
- YouTube Music single playlists can be identified by step 4.

**Non-Goals:**
- Singles for hints without a track count: Qobuz's and Tidal's pages, Apple's lookup (which keeps its " - Single" rule), and an agent's details.
- Reading a single from YouTube's playlist title: YouTube titles single playlists "Album - …" too (seen for *Opiate²*).

## Decisions

- **Singles count when the hints carry a track count.** The condition is `hints.tracks !== undefined`, not a "from YouTube" flag. The track count is what makes singles safe: it tells an album playlist from a namesake single, as it already tells it from a namesake EP. Any future hints with a track count get the same rule and the same safeguard. A source flag was considered, but it would let singles through on a source that stopped sending counts.
- **No new type list.** The types become Album, EP and Single when the hints carry a track count or Apple's title says " - Single"; otherwise Album and EP, as before.

## Risks / Trade-offs

- **A namesake album and single with the same track count** would both pass → the person chooses between them, since "several albums" is a choice, never a guess.
- **A single whose MusicBrainz release has a different track count** from YouTube's playlist (a B-side on one only) still goes to manual entry, as today.
- **Not re-measured on the YouTube spike's labelled links** (TON-128): its harness has no track-count rule. The identification cases cover *Opiate²* and the namesake EP; the rule's unit tests cover a namesake single.
