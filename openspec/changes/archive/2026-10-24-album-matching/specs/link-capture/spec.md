# Spec Delta

## ADDED Requirements

### Requirement: A confident match reuses the saved album
A captured link SHALL reuse the owner's album, in Trash or not, when it has the same link, is the same MusicBrainz album, or is saved as a release group MusicBrainz has since merged into it (FR-02.9, FR-02.12, TS-44, AC-09). Title and artist similarity alone SHALL NOT make two albums the same. A reused album SHALL keep its values and have only its gaps filled (FR-03.3), and SHALL join the requested list at most once (FR-01.7).

#### Scenario: Another edition of a saved album
- **WHEN** an owner who has *Bleach* captures a link to "Bleach (Deluxe Edition)" into the list "Grunge"
- **THEN** the saved *Bleach* is reused and put in "Grunge", no second album is created, and the result says it was reused

#### Scenario: Already in the list
- **WHEN** the owner captures a link to an album already in the list they capture into
- **THEN** its entry is kept, and the result says it was already in the list

#### Scenario: A merged release group
- **WHEN** an album is saved as a release group MusicBrainz has since merged into the one a new link identifies
- **THEN** capture reuses that album and stores the new release group

#### Scenario: Same title, different album
- **WHEN** an owner has Weezer's 1994 *Weezer*, and captures a link to their 2001 *Weezer*, a different release group
- **THEN** a new album is created

### Requirement: Capture brings a trashed album back with only the requested list
When the matched album is in Trash, capture SHALL reactivate it and end its expiry (FR-14.4, TS-13, AC-07). Its entries in active lists SHALL be removed, its entries in trashed lists kept for their recovery, and only the requested list applied; with none requested, it SHALL go to Unsorted. When an active album and a trashed one both match, the active one SHALL be reused and the trashed one left as it is (FR-14.3).

#### Scenario: Re-added into a list
- **WHEN** an album that was in "Favorites" and "Late night" is in Trash, and its link is captured into "Late night"
- **THEN** it leaves Trash, is in "Late night" only, and the result says it was restored

#### Scenario: Re-added without a list
- **WHEN** a trashed album's link is captured without a list
- **THEN** it leaves Trash and appears in Unsorted

#### Scenario: An entry in a trashed list is kept
- **WHEN** a trashed album was also in a list that is in Trash, and it is re-added
- **THEN** that entry is kept, so recovering the list brings the album back into it

#### Scenario: An active record wins
- **WHEN** the same album is both active and in Trash, and its link is captured
- **THEN** the active album is reused, and the trashed one stays in Trash with its expiry

### Requirement: A capture without a list goes to Unsorted
A capture MAY omit the list (FR-02.2, AC-07). A new album captured without one SHALL appear in Unsorted, and a reused active album SHALL keep its lists.

#### Scenario: A new album without a list
- **WHEN** an owner captures a link to an album they don't have, without a list
- **THEN** the album is created and appears in Unsorted

#### Scenario: A reused album keeps its lists
- **WHEN** an album in "Favorites" is captured again without a list
- **THEN** it stays in "Favorites" only

### Requirement: Uncertain matches wait unapplied
When several albums fit a link, capture SHALL attach no link, add no entry and create no album, and SHALL answer `needs_input` (`match`) with the candidates, each naming the owner's album it already is, if any (FR-02.10, TS-26, AC-09). Resubmitted with a candidate, the capture SHALL save that album. A choice the link doesn't offer SHALL be answered with the candidates again. In a batch, the other items SHALL go on.

#### Scenario: Two albums fit
- **WHEN** a link whose hints fit *The Last in Line* and *Holy Diver* is captured
- **THEN** nothing is saved, and the answer asks which album it is, naming both

#### Scenario: The person chooses
- **WHEN** that capture is resubmitted with *The Last in Line* chosen
- **THEN** *The Last in Line* is saved

#### Scenario: Independent items go on
- **WHEN** a batch captures that link and two links that identify one album each
- **THEN** the two are saved, and the first waits for a choice

### Requirement: An automated addition missing its year asks for it
A captured album SHALL be saved only with its title, artist and applicable year (FR-02.6, AC-08). When MusicBrainz lacks one, capture SHALL answer `needs_input` (`details`), prefilled with what MusicBrainz has and the link kept, and save nothing. Resubmitted with the details, it SHALL save the album with the release group, and values left as offered SHALL keep their source (TS-15).

#### Scenario: MusicBrainz has no year
- **WHEN** a link identifies a release group with no first release date
- **THEN** nothing is saved, and the answer asks for the details, prefilled with MusicBrainz's title and artist

#### Scenario: The details are given
- **WHEN** that capture is resubmitted with the title and artist as offered and a year
- **THEN** the album is saved as that release group, its title and artist from `musicbrainz` and its year from `user`

#### Scenario: Apple's hints kept
- **WHEN** an unidentified Apple Music link is resubmitted with iTunes Lookup's title and artist as offered, and a corrected year
- **THEN** the album is saved with the link, its title and artist from `itunes-lookup` and its year from `user`

### Requirement: Capture fills an absent link and keeps a different one
A captured link SHALL be saved on the album when it has no link for that service (FR-06.4). When it has a different one, capture SHALL keep it, still apply the list, and report both. An equivalent form of the saved link SHALL change nothing.

#### Scenario: A second service's link
- **WHEN** an album saved from a Spotify link is captured from an Apple Music link
- **THEN** it has both links

#### Scenario: A different link for the same service
- **WHEN** an album has a Spotify link, and a different Spotify link that identifies the same album is captured
- **THEN** the album keeps its link, the requested list is applied, and the result reports the kept and the pasted link
