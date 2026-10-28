## ADDED Requirements

### Requirement: Albums take an artwork URL, entered or enriched
An album SHALL have an optional artwork URL, which an owner enters or replaces in manual entry and in the inspector in Editing mode (FR-03.4). It SHALL be an https link; anything else SHALL be refused with its reason, and nothing changed. Enrichment SHALL fill it only when the album has none (FR-03.3), and its owner's sessions SHALL receive it.

#### Scenario: Entering artwork
- **WHEN** an owner sets an album's artwork URL to an https link
- **THEN** the album shows that artwork

#### Scenario: Not an https link
- **WHEN** an owner sets an album's artwork URL to an http link
- **THEN** it is refused with its reason, and the album keeps its artwork

#### Scenario: Enriched artwork reaches the app
- **WHEN** enrichment fills an album's artwork from the Cover Art Archive
- **THEN** the owner's open sessions show it

### Requirement: Artwork shows only through the image proxy
Clients SHALL show artwork only from the API's image proxy, for URLs the server signed, never from the artwork's own host (Q-05, TS-103). The proxy SHALL fetch only public https hosts, serve only raster images, and refuse any URL it didn't sign. The web app's CSP SHALL allow images only from itself and the API.

#### Scenario: A signed image
- **WHEN** an album with artwork is shown
- **THEN** its image comes from the API host, and the browser never contacts the artwork's host

#### Scenario: An unsigned URL
- **WHEN** someone asks the proxy for a URL the server didn't sign
- **THEN** it answers 404 and fetches nothing

#### Scenario: Not a raster image
- **WHEN** a signed URL answers with an SVG or no image
- **THEN** the proxy answers 404

### Requirement: Missing or failed artwork shows the fallback tile
An album without artwork, or whose artwork is loading or fails to load, SHALL show its fallback tile, never an error (FR-03.4, DS-23).

#### Scenario: A failed image
- **WHEN** an album's artwork can't be fetched
- **THEN** it shows its letter tile, and can be used as any album
