# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Album and track links of the four services are recognised`
- TO: `### Requirement: Album and track links of the launch services are recognised`

## MODIFIED Requirements

### Requirement: Album and track links of the launch services are recognised
Capture SHALL recognise Spotify, Apple Music, Qobuz, Tidal and YouTube Music album and track links in their common share forms (FR-02.1, TS-40): Spotify `intl-`, `si` and `spotify:` forms; Apple Music album, `?i=` and `/song/` links; Qobuz store, `open.` and `play.` links; Tidal `/browse`, `listen.`, `www.`, `/u` and `?u` forms; YouTube Music `/playlist` and `/watch` links with an `OLAK5uy_` list, on any youtube.com host. Each SHALL give its service, kind, id and canonical URL.

#### Scenario: A Spotify share link
- **WHEN** a link `https://open.spotify.com/intl-de/album/1KVGLuPtrMrLlyy4Je6df7?si=LnOyGBweR4agFG4VItiz7A` is pasted
- **THEN** it is a Spotify album with id `1KVGLuPtrMrLlyy4Je6df7` and canonical URL `https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7`

#### Scenario: An Apple Music song from an album
- **WHEN** a link `https://music.apple.com/us/album/kind-of-blue/268443092?i=268443097` is pasted
- **THEN** it is an Apple Music track with id `268443097` on the album `268443092`

#### Scenario: An Apple Music song link
- **WHEN** a link `https://music.apple.com/fi/song/so-what/268443097` is pasted
- **THEN** it is an Apple Music track with id `268443097`, with its album left for identification to find

#### Scenario: A Qobuz store link
- **WHEN** a link `https://www.qobuz.com/us-en/album/weezer-teal-album-weezer/mco0vy9isdq4a` is pasted
- **THEN** it is a Qobuz album with id `mco0vy9isdq4a`, canonical URL `https://open.qobuz.com/album/mco0vy9isdq4a`, and its store and slug kept for identification

#### Scenario: A Tidal share link
- **WHEN** a link `https://tidal.com/browse/track/279764934?u` is pasted
- **THEN** it is a Tidal track with id `279764934` and canonical URL `https://tidal.com/track/279764934`

#### Scenario: A YouTube Music share link
- **WHEN** a link `https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM&si=x` is pasted
- **THEN** it is a YouTube Music album with canonical URL `https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM`

#### Scenario: Real links
- **WHEN** each link of the G1 spikes' samples is parsed
- **THEN** every one is recognised, as the service and kind it was sampled as

### Requirement: Unsupported input is explained
Input that isn't an album or track link of the launch services SHALL fail with `unsupported_link` and a reason for people (FR-02.3), and nothing is fetched for it. The reason SHALL say whether the input isn't such a link at all, is a link of a supported service that isn't an album or track, or looks incomplete. A YouTube link that names no album SHALL point to YouTube Music's Share menu.

#### Scenario: A playlist
- **WHEN** a link `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` is pasted
- **THEN** it fails with `unsupported_link`, saying only Spotify album and track links can be added

#### Scenario: Another site
- **WHEN** a link `https://soundcloud.com/x` or the text "Kind of Blue" is pasted
- **THEN** it fails with `unsupported_link`, saying it isn't a Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track link

#### Scenario: A YouTube video alone
- **WHEN** a link `https://www.youtube.com/watch?v=dQw4w9WgXcQ` is pasted
- **THEN** it fails with `unsupported_link`, saying to copy the album's link from YouTube Music's Share menu

#### Scenario: An incomplete link
- **WHEN** a link `https://open.spotify.com/album/1KVGLuPtrM` is pasted
- **THEN** it fails with `unsupported_link`, saying the link looks incomplete

### Requirement: Track links identify the album they belong to
A track link SHALL identify the album of the release it belongs to (FR-02.3). For Spotify, `Get Track` gives it. For Apple Music, the path gives it, or one iTunes Lookup for a `/song/` link. For YouTube Music, the link's album playlist gives it. Tidal and Qobuz track links name no album Tonaris may look up: they SHALL go to manual entry with the link kept, after no request (decided 20 and 24 October 2026).

#### Scenario: An Apple Music song link
- **WHEN** a link `https://music.apple.com/fi/song/so-what/268443097` is pasted
- **THEN** its album is found through iTunes Lookup, and identified as *Kind of Blue*

#### Scenario: A YouTube Music track in an album
- **WHEN** a link `https://music.youtube.com/watch?v=lYBUbBu4W08&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM` is pasted
- **THEN** it is identified as that album playlist's album, and the album's link is the playlist's

#### Scenario: A Qobuz track link
- **WHEN** a link `https://open.qobuz.com/track/59954874` is pasted
- **THEN** it goes to manual entry with the link kept, saying a Qobuz track link names no album, and no request is made

### Requirement: Pasted links are captured where they are pasted
On desktop, an owner SHALL add albums by pasting links of the launch services anywhere in the workspace while no text field has focus (FR-02.1). Each pasted line that looks like a link SHALL become one capture. In a list, the albums SHALL go to that list; anywhere else they SHALL be saved without a list, into Unsorted, with adding to a list offered (FR-02.2). Pasting SHALL switch to Editing mode first, and SHALL wait while offline. Text with no link in it SHALL be ignored.

#### Scenario: Pasting in a list
- **WHEN** an owner viewing the list "Grunge" pastes a Spotify album link
- **THEN** the album is captured into "Grunge"

#### Scenario: Pasting elsewhere
- **WHEN** an owner viewing their collection's root pastes an Apple Music album link
- **THEN** the album is saved without a list, appears in Unsorted, and "Add to list…" is offered

#### Scenario: Several links at once
- **WHEN** an owner pastes three links on three lines
- **THEN** three captures start, reported together as one batch

#### Scenario: Typing in a field
- **WHEN** an owner pastes a link into a text field
- **THEN** the field gets the text, and nothing is captured

## ADDED Requirements

### Requirement: YouTube Music hints need the playlist's track count
For a YouTube Music link, step 4 SHALL use the Data API's title without a leading "Album - ", the "- Topic" channel's artist and the distributor's date, and SHALL accept a match only if one album passes step 4's rule with a release whose track count is the playlist's (TS-41). Nothing from YouTube SHALL be prefilled.

#### Scenario: An album and its namesake EP
- **WHEN** a playlist of 12 tracks gives hints that fit an album of 12 tracks and an EP of the same name and year with 4
- **THEN** the album is the answer

#### Scenario: No release with the playlist's tracks
- **WHEN** the only album that fits has no release with the playlist's track count
- **THEN** the link goes to manual entry with only the link kept
