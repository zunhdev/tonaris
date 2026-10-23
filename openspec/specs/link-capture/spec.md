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
