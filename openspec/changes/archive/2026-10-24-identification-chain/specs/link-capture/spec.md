# Spec Delta

## ADDED Requirements

### Requirement: A pasted link is identified in TS-41's order
Capture SHALL identify the album behind a supported link by asking in order, and SHALL stop at the first confident answer (FR-02.1, TS-41). The order: an album of the owner's with the same link, Trash included; MusicBrainz's URL lookup for every form of the link; the barcode bridge for Spotify and Qobuz; then hints for a strict MusicBrainz match. A confident answer SHALL be one MusicBrainz album, the release group, whichever edition the link names (FR-02.12).

#### Scenario: A link already saved
- **WHEN** an owner pastes a Spotify link one of their albums in Trash already has
- **THEN** that album is the answer, and nothing is asked of MusicBrainz

#### Scenario: A link MusicBrainz knows
- **WHEN** a Spotify album link MusicBrainz relates to a release is pasted
- **THEN** the answer is that release's album, from one URL lookup

#### Scenario: A barcode MusicBrainz knows
- **WHEN** a Spotify album link MusicBrainz doesn't know is pasted, and its UPC is a release's barcode in MusicBrainz
- **THEN** the answer is that release's album

#### Scenario: Hints that fit one album
- **WHEN** an Apple Music link to "Икра (Deluxe)" is pasted, which MusicBrainz's URL lookup doesn't know
- **THEN** iTunes Lookup's title, artist and date identify *Икра*, the album, even though the artist is spelt "Mumiy Troll" there

### Requirement: Track links identify the album they belong to
A track link SHALL identify the album of the release it belongs to (FR-02.3). For Spotify, `Get Track` gives it. For Apple Music, the path gives it, or one iTunes Lookup for a `/song/` link. Tidal and Qobuz track links name no album Tonaris may look up: they SHALL go to manual entry with the link kept, after no request (decided 20 and 24 October 2026).

#### Scenario: An Apple Music song link
- **WHEN** a link `https://music.apple.com/fi/song/so-what/268443097` is pasted
- **THEN** its album is found through iTunes Lookup, and identified as *Kind of Blue*

#### Scenario: A Qobuz track link
- **WHEN** a link `https://open.qobuz.com/track/59954874` is pasted
- **THEN** it goes to manual entry with the link kept, saying a Qobuz track link names no album, and no request is made

### Requirement: A hinted match needs exactly one album
Step 4 SHALL accept a match only when exactly one album passes (TS-41, decided 21 October 2026). The search is by the cleaned title and first artist, then by the title alone. Titles and artist names (credited, artist or sort names) are compared on letters and digits, and the year must be the release's or the album's first. Only official albums and EPs count, plus singles when Apple's title says " - Single". Cleaning SHALL keep "(Taylor's Version)" and drop "(Standard)".

#### Scenario: Two albums fit
- **WHEN** a Tidal page's hints for Dio's *The Last in Line* (1984) fit releases of two albums in MusicBrainz
- **THEN** no album is chosen, and both are offered to choose from

#### Scenario: A single of the same name
- **WHEN** Apple's hints for Trust's *Idéal* (1983) fit the album *Idéal* and a 1983 single of that name
- **THEN** the album is the answer: singles count only when Apple's title says " - Single"

#### Scenario: The year rules out a different recording
- **WHEN** Apple's hints name *The Nutcracker (Remastered 2026)*, dated 2026, and MusicBrainz's *Nutcracker* albums are from other years
- **THEN** no album is identified, and the link goes to manual entry

#### Scenario: A re-recording
- **WHEN** a Qobuz link's page names "Red (Taylor's Version)" by Taylor Swift, from 2021
- **THEN** the answer is *Red (Taylor's Version)*, never *Red* (2012)

### Requirement: Several albums are a choice, not a guess
When any step finds several albums, capture SHALL answer `needs_input` (`match`) with the candidates, and SHALL NOT pick one (FR-02.9, TS-26).

#### Scenario: A URL linked to two albums
- **WHEN** MusicBrainz relates a pasted URL to releases of two albums
- **THEN** the answer is `needs_input` with both albums as candidates

### Requirement: An unidentified link goes to manual entry with what is known
A supported link no step identifies SHALL answer `needs_input` (`details`), asking for the title, artist and year with the link kept (FR-02.3, FR-02.4, FR-10.5). Apple's hints SHALL be offered as prefill. Nothing from a Qobuz or Tidal page SHALL be. A provider that can't be asked SHALL fail with `provider_unavailable`, so the capture can be retried with the link kept (FR-02.5).

#### Scenario: An Apple link MusicBrainz lacks
- **WHEN** an Apple Music link that no step identifies is pasted
- **THEN** the answer asks for details, prefilled with iTunes Lookup's title, artist and year, with the link kept

#### Scenario: A Tidal page MusicBrainz can't match
- **WHEN** a Tidal link's page has hints that fit no album
- **THEN** the answer asks for details with only the link kept

#### Scenario: MusicBrainz unavailable
- **WHEN** MusicBrainz stays busy through every retry
- **THEN** the capture fails with `provider_unavailable`

### Requirement: Agent captures read no store pages
A capture an agent starts SHALL NOT read Qobuz's or Tidal's album pages (FR-10.5, decided 21 October 2026). Qobuz's request A, which reads only a redirect's `Location`, SHALL still run. Apple's hints, from iTunes Lookup, SHALL still apply.

#### Scenario: An agent adds a Qobuz link
- **WHEN** an agent adds an open.qobuz.com album link no other step identifies
- **THEN** the only album page asked of www.qobuz.com is request A's, and the answer asks the agent for title, artist and year with the link kept

#### Scenario: An agent adds a Tidal link
- **WHEN** an agent adds a Tidal album link
- **THEN** no request goes to tidal.com
