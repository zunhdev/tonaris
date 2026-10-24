# Spec Delta

## ADDED Requirements

### Requirement: Enrichment asks MusicBrainz about the album, and a live album's recordings
Enrichment SHALL ask MusicBrainz for the release group with its artist credit and releases, and, only for a live album, for its first official release's recordings with their relationships (TS-41, TS-46). Both answers SHALL be kept for 7 days by MBID. It SHALL then ask the Cover Art Archive for the release group's front.

#### Scenario: A studio album
- **WHEN** a studio album is enriched
- **THEN** MusicBrainz is asked once, for the release group, and the Cover Art Archive once

#### Scenario: A live album
- **WHEN** a live album is enriched
- **THEN** MusicBrainz is asked twice: for the release group, then for its first official release's recordings

#### Scenario: The same album again within 7 days
- **WHEN** an album enriched less than 7 days ago is enriched again
- **THEN** no request is sent

### Requirement: Unavailable artwork doesn't hold up enrichment
When the Cover Art Archive can't be asked, enrichment SHALL go on without artwork, so the album's other values are still filled (FR-03.4). When MusicBrainz can't be asked, enrichment SHALL fail as `provider_unavailable`, writing nothing, so it can be retried (TS-90).

#### Scenario: The Cover Art Archive is down
- **WHEN** an album is enriched while the Cover Art Archive answers 503
- **THEN** its other values are filled, and it has no artwork yet

#### Scenario: MusicBrainz stays busy
- **WHEN** an album is enriched while MusicBrainz answers 503 to every retry
- **THEN** enrichment fails as MusicBrainz being unavailable, and the album is unchanged
