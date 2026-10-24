# Spec Delta

## ADDED Requirements

### Requirement: Enrichment fills only missing values
Enrichment, on capture, on a retry or from a newly matched link, SHALL fill only the album's values that are missing, and SHALL keep every populated value, whoever entered it, including a classification MusicBrainz disagrees with (FR-03.3, TS-42, AC-10). It SHALL keep an existing artwork URL (FR-03.4). What MusicBrainz lacks SHALL stay unknown (FR-02.8).

#### Scenario: A person's values are kept
- **WHEN** an owner's album has the title "Bleach", no release type and the original year 1990 they entered, and it is enriched from MusicBrainz's *Bleach* (Album, 1989)
- **THEN** its title and year stay as entered, and its release type becomes Album

#### Scenario: A conflicting classification is kept
- **WHEN** an album the owner marked as an EP is enriched from a release group MusicBrainz types as an Album
- **THEN** it stays an EP

#### Scenario: Enriching again changes nothing
- **WHEN** an album already enriched from its release group is enriched again from the same facts
- **THEN** nothing is written, and no change reaches the owner's sessions

#### Scenario: Artwork kept or added
- **WHEN** an album with no artwork, and another with an artwork URL, are enriched from a release group with a Cover Art Archive front
- **THEN** the first gets the front's address, and the second keeps its URL

#### Scenario: Missing facts stay unknown
- **WHEN** MusicBrainz has no first release date for an album
- **THEN** its original year stays unknown, and no year is invented

### Requirement: An album takes its release group's title, artist and first year
An album enriched from MusicBrainz SHALL take the release group's title and artist credit, and the year of its first release, whichever edition the link named (FR-02.12, TS-41, AC-09).

#### Scenario: A deluxe edition's album
- **WHEN** a new album is enriched from the release group a link to "Bleach (Deluxe Edition)" identified
- **THEN** it is *Bleach* by Nirvana, 1989

### Requirement: Classification follows MusicBrainz's types
Enrichment SHALL classify an album from its release group's types (FR-02.8, FR-05.9, TS-45). Album and EP map to themselves; Single, Broadcast and Other are Unclassified, whatever their secondary types (decided 24 October 2026). For an Album, an EP, or a release group with no primary type, the secondary type Compilation SHALL make it a compilation and Live SHALL make it live. Unknown types SHALL stay unknown.

#### Scenario: A live compilation
- **WHEN** an album is enriched from a release group typed Album, with the secondary types Compilation and Live
- **THEN** it is a live compilation, so it groups as Live

#### Scenario: A live single
- **WHEN** an album is enriched from a release group typed Single, with the secondary type Live
- **THEN** it is Unclassified and not live

#### Scenario: No types
- **WHEN** an album is enriched from a release group with no primary or secondary type
- **THEN** its release type and whether it is live stay unknown

### Requirement: A live album's recording years come from its recordings
For a live album, enrichment SHALL take the recording years from the earliest and latest dates of its recordings' "recorded at" and "recorded in" relationships, using the event's dates for a recording dated only through the event (FR-02.8, FR-05.5, TS-46). The recordings SHALL be those of the album's first official release. A range SHALL be filled whole, and only for an album that is live. Release dates SHALL never fill recording years (AC-14).

#### Scenario: A concert recorded on one night
- **WHEN** an album is enriched from *The Köln Concert*, recorded on 24 January 1975 and first released in 1975
- **THEN** its recording year is 1975, and its original year 1975

#### Scenario: A live album recorded over years
- **WHEN** an album is enriched from Bruce Springsteen's *Live/1975–85*
- **THEN** its recording years are 1975–1985

#### Scenario: A recording dated only through its event
- **WHEN** a live album's recordings have no dated relationships, and are recorded at an event of 1969
- **THEN** its recording year is 1969

#### Scenario: No recording dates
- **WHEN** a live album's recordings carry no dates
- **THEN** its recording years stay unknown, and it sorts by its original year with the fallback shown (FR-05.6)

#### Scenario: An album the owner says isn't live
- **WHEN** an album the owner marked as not live is enriched from a live release group with recording dates
- **THEN** it stays not live, and gets no recording years

### Requirement: Every metadata value records where it came from
Each saved metadata value SHALL record its source: `user` for what a person or their agent wrote, `musicbrainz` or `coverartarchive` for what enrichment filled, or `itunes-lookup` for Apple's hints a person kept (TS-15). An edit SHALL make the source `user`. Each source SHALL have policy flags for storing, agents and exports, and a value a policy withholds SHALL be marked as withheld, never dropped (FR-08.8).

#### Scenario: Enrichment's sources
- **WHEN** an album's year and artwork are filled from MusicBrainz and the Cover Art Archive
- **THEN** the year's source is `musicbrainz` with the release group's MBID, and the artwork's `coverartarchive`

#### Scenario: An edit is the person's
- **WHEN** an owner edits the year enrichment filled
- **THEN** the year's source is `user`

#### Scenario: Nothing is withheld today
- **WHEN** an album with values from every current source is prepared for an agent or an export
- **THEN** every value is included

#### Scenario: A withheld value is marked
- **WHEN** a policy withholds a source's values from exports, and an album with one of them is exported
- **THEN** that value is replaced by `"withheld": "provider-policy"`

### Requirement: Albums follow MusicBrainz's changed release group ids
When MusicBrainz answers an album's stored release group with another id, because it merged them, enrichment SHALL store the new id (FR-02.12, TS-44, decided 21 October 2026). When it answers that the release group no longer exists, the album SHALL keep all its data and no longer be identified.

#### Scenario: A merged release group
- **WHEN** an album saved with *Shoot for the Stars Aim for the Moon*'s release group `fcd3637b-3365-4780-802d-0013b070bca2` is enriched, and MusicBrainz now answers it as `d6d1de65-7e43-4277-b723-fc74a2b385e1`
- **THEN** the album's release group becomes `d6d1de65-7e43-4277-b723-fc74a2b385e1`

#### Scenario: A deleted release group
- **WHEN** an album's stored release group answers 404
- **THEN** the album keeps its title, artist, years and classification, and has no release group
