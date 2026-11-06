## MODIFIED Requirements

### Requirement: Unavailable artwork doesn't hold up enrichment
When the Cover Art Archive can't be asked, enrichment SHALL go on without artwork, so the album's other values are still filled (FR-03.4). When MusicBrainz can't be asked, the capture SHALL fail as `provider_unavailable`, writing nothing, so the person can retry it.

#### Scenario: The Cover Art Archive is down
- **WHEN** an album is captured while the Cover Art Archive answers 503
- **THEN** its other values are filled, and it has no artwork yet

#### Scenario: MusicBrainz stays busy
- **WHEN** an album is captured while MusicBrainz answers 503 to every retry
- **THEN** the capture fails as MusicBrainz being unavailable, and nothing is saved
