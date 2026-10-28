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

### Requirement: Pasted links are captured where they are pasted
On desktop, an owner SHALL add albums by pasting Spotify, Apple Music, Qobuz or Tidal links anywhere in the workspace while no text field has focus (FR-02.1). Each pasted line that looks like a link SHALL become one capture. In a list, the albums SHALL go to that list; anywhere else they SHALL be saved without a list, into Unsorted, with adding to a list offered (FR-02.2). Pasting SHALL switch to Editing mode first, and SHALL wait while offline. Text with no link in it SHALL be ignored.

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

### Requirement: The capture dialog takes links and a destination
`C` and "+ Add album" SHALL open a dialog taking one link per line and an optional destination list, defaulting to the list on view, else none (FR-02.1, FR-02.2). It SHALL offer manual entry instead (FR-02.4).

#### Scenario: Capturing from the dialog
- **WHEN** an owner presses `C`, enters two links, chooses the list "Grunge" and adds them
- **THEN** both are captured into "Grunge"

#### Scenario: Entering manually instead
- **WHEN** an owner opens the capture dialog and chooses "Enter manually"
- **THEN** the manual entry form opens, going to the same destination

### Requirement: A capture shows its progress and its failure where it lands
While a capture runs, its destination view SHALL show it as a placeholder row with its link. A capture that fails SHALL keep its row with the reason, and offer Retry, Enter manually and Dismiss (FR-02.5). The pasted link SHALL be kept, across reloads, until the capture is saved or dismissed. A refusal at a limit SHALL be shown in the same place, with its reason (FR-15.3).

#### Scenario: Resolving
- **WHEN** a capture into "Grunge" is still running
- **THEN** "Grunge" shows a row for it reading "Resolving link…", and the owner can keep working meanwhile

#### Scenario: A failure keeps the link
- **WHEN** a capture fails because MusicBrainz can't be reached
- **THEN** its row explains that, offers Retry, Enter manually and Dismiss, and still shows the link after a reload

#### Scenario: Retry
- **WHEN** the owner retries a failed capture and the source answers
- **THEN** the album is saved, and the row becomes the album

#### Scenario: Unsupported input
- **WHEN** a pasted line isn't a link of the four services
- **THEN** its row says so, and offers manual entry

### Requirement: Manual entry continues a capture
Enter manually SHALL open the manual entry form prefilled with what is known: the pasted link and capture's values, if any (FR-02.4). When capture asked for the album's details (FR-02.3, FR-02.6), saving the form SHALL complete that capture, keeping the link and the sources of values left as offered. After a failure, saving SHALL add the album with the pasted link as its link for that service, when it is one.

#### Scenario: A Tidal track link
- **WHEN** a pasted Tidal track link asks for the album's details, and the owner enters them
- **THEN** the album is saved with the Tidal link

#### Scenario: Apple's hints offered
- **WHEN** an Apple Music link capture couldn't identify comes back with Apple's title, artist and year, and the owner saves them unchanged
- **THEN** the album is saved with those values and the link

#### Scenario: After a failure
- **WHEN** a Spotify link's capture failed and the owner enters the album manually from its row
- **THEN** the album is saved with that Spotify link, and the failed capture is gone

### Requirement: The person decides an uncertain match
A capture that fits several albums SHALL show their choices without applying anything (FR-02.9): each candidate by its title, marked when it is already in the collection, "None of these", and "Decide later". Choosing a candidate SHALL complete the capture as that album. "None of these" SHALL open manual entry, saving the album unidentified with the link. "Decide later" SHALL leave it pending while other items go on (FR-02.10).

#### Scenario: Choosing
- **WHEN** a capture fits "The Last in Line" and "Holy Diver", and the owner chooses "The Last in Line"
- **THEN** "The Last in Line" is saved into the destination

#### Scenario: Deciding later in a batch
- **WHEN** one of three pasted links fits two albums
- **THEN** the other two are saved, and the third waits under Needs you until decided or dismissed

### Requirement: Outcomes are reported plainly
A capture's outcome SHALL be reported as DS-48 says (FR-02.9, FR-01.7, FR-14.4, FR-06.4): an album already in the collection that was added to the list, an album already in the list, an album restored from Trash, and a link kept instead of the pasted one, with a way to review it. A kept link's alternative SHALL be offered in the album's inspector for explicit replacement.

#### Scenario: Already in the list
- **WHEN** an owner pastes a link to an album already in the list on view
- **THEN** "Already in this list" is shown, and nothing else changes

#### Scenario: A kept link
- **WHEN** a capture keeps the album's Spotify link instead of the pasted one
- **THEN** "Kept your existing Spotify link" is shown with Review, and the inspector offers to replace it with the pasted one

### Requirement: Batches report each item
A paste or dialog submission of more than one link SHALL show a progress panel with how many are done, need the person and failed, which opens the batch's report (FR-02.11, FR-13.4). Each item SHALL be sent on its own, so each settles as it finishes, and invalid items SHALL be reported with their reasons without holding up the others.

#### Scenario: A batch with a failure
- **WHEN** an owner pastes four links and one is unsupported
- **THEN** three albums are saved, the panel reads that one failed, and the report lists it with its reason

### Requirement: Captures don't hold up other edits
A capture SHALL be sent after the edits made before it, so a capture into a list just created finds the list. It SHALL NOT delay edits made after it: they are saved while it runs (TS-22). A capture whose answer is lost SHALL be resent until its outcome is known, and shall be saved at most once.

#### Scenario: Editing while a capture runs
- **WHEN** a capture is still running and the owner renames a list
- **THEN** the rename is saved without waiting for the capture

#### Scenario: Into a new list
- **WHEN** an owner creates the list "Doom" and at once pastes a link into it
- **THEN** the album is captured into "Doom"
