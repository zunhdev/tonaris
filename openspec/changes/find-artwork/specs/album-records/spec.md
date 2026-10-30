# Spec Delta

## ADDED Requirements

### Requirement: Owners find artwork on the Cover Art Archive
An owner SHALL be able to search for an album's artwork from the inspector in Editing mode and from the manual entry form (FR-03.4). The search SHALL look up MusicBrainz's albums by the album's title and artist, and offer those the Cover Art Archive has a front cover for, each shown through the image proxy with its title, year and type. Choosing one SHALL set the artwork URL to the archive's `front-500` address, and change nothing else.

#### Scenario: Choosing a cover
- **WHEN** an owner chooses Find artwork for "Kill 'Em All" by Metallica, which has no artwork, and picks the first cover
- **THEN** the album's artwork URL is that cover's `front-500` address, and its other values are unchanged

#### Scenario: In the manual entry form
- **WHEN** an owner fills in a new album's title and artist, chooses Find artwork and picks a cover
- **THEN** the form's Artwork URL holds that cover's address

### Requirement: Finding artwork reports what it can't find
When no album found has a front cover, Find artwork SHALL say so. When MusicBrainz or the Cover Art Archive can't be asked, it SHALL say so, with a way to try again. While offline, Find artwork SHALL be disabled.

#### Scenario: Nothing found
- **WHEN** no album found for the title and artist has a front cover
- **THEN** Find artwork says no covers were found

#### Scenario: MusicBrainz unavailable
- **WHEN** MusicBrainz can't be asked
- **THEN** Find artwork says it couldn't reach MusicBrainz, and offers Try again
