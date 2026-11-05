# Spec Delta

## MODIFIED Requirements

### Requirement: YouTube Music hints need the playlist's track count
For a YouTube Music link, step 4 SHALL use the Data API's title without a leading "Album - ", the "- Topic" channel's artist and the distributor's date, and SHALL accept a match only if one album passes step 4's rule with a release whose track count is the playlist's (TS-41). Official singles SHALL count too, besides albums and EPs, whatever the playlist's title says (TON-163). Nothing from YouTube SHALL be prefilled.

#### Scenario: An album and its namesake EP
- **WHEN** a playlist of 12 tracks gives hints that fit an album of 12 tracks and an EP of the same name and year with 4
- **THEN** the album is the answer

#### Scenario: No release with the playlist's tracks
- **WHEN** the only album that fits has no release with the playlist's track count
- **THEN** the link goes to manual entry with only the link kept

#### Scenario: A single
- **WHEN** a playlist titled "Album - Opiate²" with 1 track gives hints that fit Tool's 2022 single *Opiate²*, whose digital release has 1 track
- **THEN** the single is the answer

#### Scenario: An album and its namesake single
- **WHEN** a playlist of 10 tracks gives hints that fit an album of 10 tracks and a single of the same name and year with 2
- **THEN** the album is the answer
