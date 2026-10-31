# Spec Delta

## MODIFIED Requirements

### Requirement: An album has at most one link per service, kept canonical
A saved album SHALL have at most one current link for each of Spotify, Apple Music, Qobuz, Tidal and YouTube Music (FR-06.2). A link SHALL be stored as its canonical URL (TS-40), whatever form it was pasted in, and links SHALL be optional for every album.

#### Scenario: A pasted variant is stored canonical
- **WHEN** an owner adds `https://open.spotify.com/intl-de/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=abc` as an album's Spotify link
- **THEN** the album's Spotify link is `https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv`

#### Scenario: Replacing keeps one link
- **WHEN** an album has a Spotify link and the owner sets another Spotify link
- **THEN** the album has only the new Spotify link, and its links for other services are unchanged

#### Scenario: A short link is followed
- **WHEN** an owner adds a `spotify.link` short link that leads to an album
- **THEN** the album's Spotify link is that album's canonical URL

#### Scenario: A YouTube Music track link
- **WHEN** an owner adds `https://www.youtube.com/watch?v=lYBUbBu4W08&list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM` as an album's YouTube Music link
- **THEN** the album's YouTube Music link is `https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM`

## ADDED Requirements

### Requirement: YouTube Music links open their page
YouTube Music has no desktop app, so its links SHALL open its web page whatever the link setting (TS-43, decided 31 October 2026). YouTube Music SHALL come after Tidal wherever services are listed.

#### Scenario: App chosen
- **WHEN** an owner whose links open in apps opens an album's YouTube Music link
- **THEN** its `music.youtube.com` page opens in a new tab
