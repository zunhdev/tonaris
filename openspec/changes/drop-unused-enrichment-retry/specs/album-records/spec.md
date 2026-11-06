## MODIFIED Requirements

### Requirement: Enrichment fills only missing values
Enrichment, when a capture saves or matches an album, including a person's Retry and a link from another service that matches a saved album, SHALL fill only the album's values that are missing, and SHALL keep every populated value, whoever entered it, including a classification MusicBrainz disagrees with (FR-03.3, TS-42, AC-10). It SHALL keep an existing artwork URL (FR-03.4). What MusicBrainz lacks SHALL stay unknown (FR-02.8).

#### Scenario: A person's values are kept
- **WHEN** an owner's album has the title "Bleach", no release type and the original year 1990 they entered, and a capture matches it to MusicBrainz's *Bleach* (Album, 1989)
- **THEN** its title and year stay as entered, and its release type becomes Album

#### Scenario: A conflicting classification is kept
- **WHEN** a capture matches an album the owner marked as an EP to a release group MusicBrainz types as an Album
- **THEN** it stays an EP

#### Scenario: Enriching again changes nothing
- **WHEN** a capture matches an album already enriched from its release group, with the same facts
- **THEN** nothing is written, and no change reaches the owner's sessions

#### Scenario: Artwork kept or added
- **WHEN** a capture matches an album with no artwork, and another with an artwork URL, to a release group with a Cover Art Archive front
- **THEN** the first gets the front's address, and the second keeps its URL

#### Scenario: Missing facts stay unknown
- **WHEN** MusicBrainz has no first release date for an album
- **THEN** its original year stays unknown, and no year is invented
