# Spec Delta

## ADDED Requirements

### Requirement: An agent's details for an unidentified link are matched strictly
When an agent resends a capture with the album's details after its link went unidentified, the details SHALL be matched by step 4's strict rule, on their title, artist credit and original year (FR-10.5, TS-41). When exactly one album passes, the capture SHALL save as that album, reusing it if it is already in the collection (FR-02.9). When MusicBrainz can't be asked, the capture SHALL fail with `provider_unavailable`, saving nothing.

#### Scenario: One album passes
- **WHEN** an agent's Tidal link that MusicBrainz doesn't know asks for details, and the agent sends "Kill 'Em All", "Metallica", 1983
- **THEN** the album is saved as MusicBrainz's release group for Kill 'Em All

#### Scenario: The album is already saved
- **WHEN** the one album that passes is already in the collection
- **THEN** that album is reused, and the link is added to it

#### Scenario: MusicBrainz unavailable
- **WHEN** MusicBrainz can't be asked while an agent's details are matched
- **THEN** the capture fails with `provider_unavailable`, and nothing is saved

### Requirement: Matched details keep the agent's values
An album saved from an agent's matched details SHALL keep every value the agent gave, and MusicBrainz SHALL fill only the values they leave unknown, its artwork included (FR-03.3). Each value SHALL record its source (TS-15).

#### Scenario: The agent's title, MusicBrainz's gaps
- **WHEN** the agent's "Kill 'Em All" matches MusicBrainz's "Kill ’Em All", and the agent gave no release type
- **THEN** the album keeps the title "Kill 'Em All" as `user`, and takes the release type from `musicbrainz` and the artwork from `coverartarchive`

### Requirement: Details that don't match are saved as entered
When none or several albums pass, or the details have no original year, the agent's album SHALL be saved as entered, with no release group and no further question. Details completed in the app's manual entry SHALL NOT be matched (FR-02.4).

#### Scenario: Several albums pass
- **WHEN** two albums pass the rule for the agent's details
- **THEN** the album is saved as entered, with no release group

#### Scenario: A live album with only its recording year
- **WHEN** the agent's details for a live album give a recording year and no original year
- **THEN** MusicBrainz isn't searched, and the album is saved as entered

#### Scenario: Details from the app
- **WHEN** a person completes a capture's details in the app's manual entry
- **THEN** the album is saved as entered, without a lookup
