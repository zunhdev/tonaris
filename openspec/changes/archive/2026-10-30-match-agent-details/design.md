# Design

## Context

- **TS-41's chain** stops at the first confident answer: the owner's own link (1), MusicBrainz's URL lookup (2), the barcode bridge (3), store-page or iTunes hints for a strict match (4), then manual entry (5).
- **Agent captures skip step 4 for Qobuz and Tidal** (FR-10.5, decided 21 October 2026): their pages reject AI use. An unidentified link answers `needs_input: details`, and the agent's resubmitted details were saved as entered, with no release group.
- **Step 4's rule** (`matchHints`) takes a title, an artist and a date. It accepts a release group only when exactly one passes: letters and digits of the cleaned titles agree, the artist is credited, the year is the release's or its album's first, and the release is official, an album or an EP.

## Goals / Non-Goals

**Goals:** an agent's details after a miss find the album when step 4's rule would have, so the album gets its release group, enrichment and artwork.

**Non-Goals:**
- matching the app's manual entry, which stays lookup-free (FR-02.4);
- matching albums an agent adds by hand, without a link;
- asking the agent to choose when several albums pass.

## Decisions

### 1. Only for agents, only after a miss

`prepareCapture` matches the details only when the principal is an MCP connection and the link is unidentified. A link that was ambiguous and resent with details ("none of these") is saved as entered, as before: the agent has already turned the candidates down.

### 2. The original year, or no match

Step 4 compares the year with a release's date or its album's first release date. A live album's recording year usually isn't either, so details without an original year are saved as entered rather than matched on the recording year.

### 3. The same strict rule, and nothing else

The details go through `matchHints` unchanged, so the bar for a match is the one the G1 spikes measured: no wrong matches in the labelled sets. Several albums passing saves as entered, rather than asking: the agent already had its question.

### 4. The agent's values win; MusicBrainz fills the gaps

An identified capture with details has, until now, saved the details as they are: they came from a form MusicBrainz had prefilled. Matched details are the agent's own, often partial, so the domain marks them `matched` and plans enrichment over them: MusicBrainz fills only the values they leave unknown (FR-03.3), with their provenance. The agent's spelling of the title stays. The Cover Art Archive's artwork is taken as for any identified capture.

### 5. MusicBrainz unavailable fails the capture

The match asks MusicBrainz through its one-a-second queue. If it can't be asked, the capture fails as `provider_unavailable` and can be resent, as for any capture (TS-90). Saving as entered instead would lose the match for good.

## Risks / Trade-offs

- **An agent's typo misses the match.** The album is saved as entered, as before, and "Find artwork" (TON-112) can still give it a cover.
- **Two or three more MusicBrainz requests** per agent capture that falls back to details, at one a second.
