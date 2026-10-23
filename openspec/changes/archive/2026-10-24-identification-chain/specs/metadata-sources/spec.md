# Spec Delta

## ADDED Requirements

### Requirement: Spotify values stay in memory
Values from Spotify's Web API, a UPC or a track's album id, SHALL live only in memory while a link is identified (TS-41). They SHALL NOT be stored, cached, logged, returned in an answer, or kept for a retry: each attempt SHALL ask Spotify again. Spotify's titles and artists SHALL NOT be used as hints. One setting SHALL turn the Spotify bridge off.

#### Scenario: A Spotify track MusicBrainz lacks
- **WHEN** a Spotify track link is identified, and neither its album's URL nor its UPC is in MusicBrainz
- **THEN** neither the album id nor the UPC appears in the answer or in anything kept

#### Scenario: The bridge turned off
- **WHEN** the Spotify bridge is off and a Spotify album link MusicBrainz's URL lookup doesn't know is pasted
- **THEN** Spotify isn't asked, and the link goes to manual entry

### Requirement: A daily check shows the Spotify bridge still works
Once a day, one `Get Album` call SHALL check that Spotify's token works and that it still returns a UPC (TS-41). A failure SHALL be logged without Spotify values.

#### Scenario: The Premium subscription lapsed
- **WHEN** Spotify refuses the token during the daily check
- **THEN** the failure is logged, naming no Spotify value

### Requirement: iTunes Lookup stays under 20 requests a minute
iTunes Lookup SHALL be asked at most once every 3 seconds, and its answers SHALL be kept for a day (TS-41).

#### Scenario: A batch of Apple links
- **WHEN** ten Apple Music links need hints at once
- **THEN** their lookups start at least 3 seconds apart

### Requirement: Store pages are read only as the terms allow
Qobuz and Tidal album pages SHALL be read only to identify a pasted link, and only transiently: nothing from them is kept (TS-41). A Qobuz link SHALL take at most two requests, both to www.qobuz.com: request A reads only a redirect's `Location`, and open. and play. links use the `fr-fr` store. A Tidal link SHALL take one request to tidal.com. Each site's robots.txt SHALL be checked at most daily, and no album page SHALL be asked for while it disallows them.

#### Scenario: An open.qobuz.com link
- **WHEN** an open.qobuz.com album link needs hints
- **THEN** request A asks `https://www.qobuz.com/fr-fr/album/-/{id}`, and request B the page its `Location` names

#### Scenario: robots.txt disallows album pages
- **WHEN** Tidal's robots.txt disallows `/album/` for Tonaris
- **THEN** no Tidal page is asked for until a later check allows it, and Tidal links go to manual entry
