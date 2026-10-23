# Spec Delta

## Purpose

How Tonaris asks metadata sources about a supplied link or album: within each source's limits, without repeating questions it has just asked, and without keeping what the rules forbid.

## ADDED Requirements

### Requirement: MusicBrainz is asked at most once a second
Every MusicBrainz request SHALL go through one queue that starts at most one request per second, whatever asks: identification, enrichment, or a batch (TS-41, TS-91). Each request SHALL carry Tonaris's User-Agent with a contact.

#### Scenario: A batch of 50 lookups
- **WHEN** 50 lookups for different albums are asked for at once
- **THEN** their requests start at least a second apart, one after another, each with Tonaris's User-Agent

### Requirement: Recent answers are reused for 7 days
MusicBrainz answers SHALL be kept for 7 days, keyed by URL, barcode and MBID (TS-41). A lookup over several forms SHALL send no request when every form is kept, or when one is kept as found. Identical lookups in flight SHALL share one request. Searches built from hints SHALL NOT be kept.

#### Scenario: The same batch again
- **WHEN** a batch of 50 lookups is asked for a second time within 7 days
- **THEN** no request is sent, and the answers are the same

#### Scenario: After 7 days
- **WHEN** a lookup was last answered more than 7 days ago
- **THEN** MusicBrainz is asked again

#### Scenario: Duplicates in a batch
- **WHEN** a batch asks for the same URL twice at once
- **THEN** one request is sent

### Requirement: Spotify values leave no cached misses
A lookup keyed by a value derived from Spotify SHALL be kept only when MusicBrainz finds it, under MusicBrainz's own barcode or URL (TS-41). Its miss SHALL leave nothing behind.

#### Scenario: A Spotify barcode MusicBrainz lacks
- **WHEN** a barcode from Spotify finds no release
- **THEN** nothing is kept for it, and asking again sends a request

#### Scenario: A Spotify barcode MusicBrainz has
- **WHEN** a barcode from Spotify, asked in its 12- and 14-digit forms, finds a release whose barcode is the 12-digit form
- **THEN** the answer is kept under that 12-digit barcode only, and asking again sends no request

### Requirement: A busy MusicBrainz is waited out
A 503 from MusicBrainz, or a 502 or 504, SHALL be retried with growing waits, honouring `Retry-After`, and SHALL hold back the whole queue (TS-41). When retries run out, the lookup SHALL fail as MusicBrainz being unavailable (`provider_unavailable`), so it can be retried later (TS-90). The failure SHALL NOT include the lookup's query.

#### Scenario: Two 503s, then an answer
- **WHEN** MusicBrainz answers 503 twice and then answers
- **THEN** the lookup succeeds, and the retries wait longer each time

#### Scenario: MusicBrainz stays busy
- **WHEN** MusicBrainz answers 503 to every retry
- **THEN** the lookup fails as MusicBrainz being unavailable, and the failure names no barcode or URL

### Requirement: A release group's front artwork is looked up on the Cover Art Archive
The Cover Art Archive SHALL be asked whether a release group has a front image. If it has, the answer SHALL be the archive's stable `front-500` address, not where it redirects (TS-41). The answer SHALL be kept for 7 days by MBID.

#### Scenario: A release group with a front
- **WHEN** the Cover Art Archive redirects a release group's `front-500` to an image
- **THEN** the artwork is `https://coverartarchive.org/release-group/{mbid}/front-500`

#### Scenario: A release group without one
- **WHEN** the Cover Art Archive answers 404
- **THEN** the release group has no artwork
