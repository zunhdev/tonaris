# link-capture Specification

## Purpose
Turns a pasted streaming-service link into the album or track it names, with a canonical URL, so capture can identify the album behind it; and explains input it can't use.

## Requirements

### Requirement: Album and track links of the four services are recognised
Capture SHALL recognise Spotify, Apple Music, Qobuz and Tidal album and track links in their common share forms (FR-02.1, TS-40): Spotify URLs with `intl-` paths or `si` parameters and `spotify:` URIs; Apple Music album links with or without a storefront, `?i=` song links and `/song/` links; Qobuz store, `open.` and `play.` links; Tidal links with `/browse`, `listen.`, `www.`, `/u` or `?u`. Each SHALL give its service, kind, id and canonical URL.

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

#### Scenario: Real links
- **WHEN** each link of the G1 spikes' samples is parsed
- **THEN** every one is recognised, as the service and kind it was sampled as

### Requirement: Unsupported input is explained
Input that isn't an album or track link of the four services SHALL fail with `unsupported_link` and a reason for people (FR-02.3), and nothing is fetched for it. The reason SHALL say whether the input isn't such a link at all, is a link of a supported service that isn't an album or track, or looks incomplete.

#### Scenario: A playlist
- **WHEN** a link `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` is pasted
- **THEN** it fails with `unsupported_link`, saying only Spotify album and track links can be added

#### Scenario: Another site
- **WHEN** a link `https://www.youtube.com/watch?v=x` or the text "Kind of Blue" is pasted
- **THEN** it fails with `unsupported_link`, saying it isn't a Spotify, Apple Music, Qobuz or Tidal album or track link

#### Scenario: An incomplete link
- **WHEN** a link `https://open.spotify.com/album/1KVGLuPtrM` is pasted
- **THEN** it fails with `unsupported_link`, saying the link looks incomplete

### Requirement: Equivalent link variants are the same link
Two links with the same service, kind and id SHALL be the same link, whatever their form, storefront or parameters (FR-06.4, TS-40), so they never conflict. Links that differ in any of the three SHALL be different links.

#### Scenario: Variants of one album
- **WHEN** `https://tidal.com/browse/album/348182611/u` and `https://listen.tidal.com/album/348182611` are compared
- **THEN** they are the same link

#### Scenario: Storefronts
- **WHEN** an Apple Music album link under the `fi` storefront and one under `us` name the same id
- **THEN** they are the same link

#### Scenario: An album and a track
- **WHEN** an Apple Music album link and a `?i=` link to one of its songs are compared
- **THEN** they are different links

### Requirement: Pasted links are read locally, and only short links are followed
Pasted text is untrusted (Q-05). Capture SHALL parse it locally and SHALL NOT fetch it, except a `spotify.link` short link: one request per hop, with redirects read rather than followed, at most 3 hops, every hop on the allowlist, and through the SSRF guard (TS-40, TS-103). A link with credentials or a port SHALL be unsupported.

#### Scenario: A short link
- **WHEN** a short link redirects to `https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7?si=x`
- **THEN** it is that Spotify album

#### Scenario: A short link off the allowlist
- **WHEN** a short link redirects to a host that isn't Spotify's
- **THEN** it fails with `unsupported_link`, and that host is never requested

#### Scenario: A short link that leads nowhere
- **WHEN** a short link redirects to Spotify's home page, or more than 3 times
- **THEN** it fails with `unsupported_link`

#### Scenario: Spotify can't be reached
- **WHEN** a short link's request fails or Spotify answers with a server error
- **THEN** it fails with `provider_unavailable`, so it can be retried

#### Scenario: Credentials in a link
- **WHEN** a link `https://user:secret@open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7` is pasted
- **THEN** it fails with `unsupported_link`

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
