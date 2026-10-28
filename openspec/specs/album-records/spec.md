# album-records Specification

## Purpose
Album records and their place in the owner's collection: one record per album, shared by every list it is in, at most one entry per list, kept when it leaves its lists, Unsorted when it is in none, and always complete with the information every album needs (FR-01.6–FR-01.10, FR-02.6, FR-02.12).

## Requirements

### Requirement: One album record is shared by every list it is in
An owner SHALL put one saved album in any number of their active lists (FR-01.6). Every entry SHALL show the same record, so its metadata is the same in each list, and an edit made from any list SHALL apply to all of them. Adding an album to a list SHALL never copy the album.

#### Scenario: An album in two lists
- **WHEN** an owner adds "Kind of Blue" to the lists "Favorites" and "Late night"
- **THEN** both lists hold the same album record, and the collection still holds one "Kind of Blue"

#### Scenario: An edit from one list shows in every list
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", and the owner corrects its year while viewing "Favorites"
- **THEN** "Late night" shows the corrected year too

### Requirement: An album appears at most once in a list
Each saved album SHALL appear at most once in a list (FR-01.7). Adding an album already in the list SHALL keep its entry and the time it was added, report that it is already in the list, and change nothing else. An entry SHALL record when the album was added.

#### Scenario: Adding an album to a list
- **WHEN** an owner adds "Kind of Blue" to the list "Favorites"
- **THEN** "Favorites" holds it, with the time it was added

#### Scenario: Adding it again keeps the entry
- **WHEN** "Kind of Blue" is already in "Favorites" and the owner adds it to "Favorites" again
- **THEN** it is reported as already in the list, and the list still holds one entry for it, with its original time and the album's metadata unchanged

### Requirement: Only active albums go into active lists the owner has
An owner SHALL add only their own active albums, and only to their own active lists (FR-01.6, X-05). Adding to a folder, to a list or album in Trash, or to a list or album that doesn't exist or is someone else's SHALL be rejected and change nothing. Removing an entry SHALL follow the same rules.

#### Scenario: Folders hold no albums
- **WHEN** an owner adds an album to a folder
- **THEN** it is rejected as an invalid destination and nothing changes

#### Scenario: Lists and albums in Trash are refused
- **WHEN** an owner adds an album to a list in Trash, or adds an album in Trash to a list
- **THEN** it is rejected because it is in Trash, and nothing changes

#### Scenario: Another person's list or album is refused
- **WHEN** a person adds an album to another person's list, or adds another person's album to their own list
- **THEN** it is rejected, and neither collection changes

### Requirement: Albums stay in the collection when their entries go
Removing an album from a list SHALL keep the album record and its other entries (FR-01.8). An album whose last entry is removed SHALL stay in the collection and appear in Unsorted. Removing an entry that isn't there SHALL change nothing. Deleting an album from the collection SHALL NOT be done by removing entries; it is a separate action (FR-14.1).

#### Scenario: Removing one of several entries
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", and the owner removes it from "Favorites"
- **THEN** it is still in "Late night", with its metadata unchanged

#### Scenario: Removing the last entry
- **WHEN** "Kind of Blue" is only in "Favorites", and the owner removes it from "Favorites"
- **THEN** the album is still in the collection, unchanged, and appears in Unsorted

#### Scenario: Removing an entry that isn't there
- **WHEN** the owner removes "Kind of Blue" from "Favorites", which doesn't hold it
- **THEN** it succeeds and nothing changes

### Requirement: Unsorted holds the owner's albums in no list
Unsorted SHALL be the owner's active albums that have no entry in an active list, maintained automatically (FR-01.9). Albums in Unsorted SHALL keep all their information, count toward the collection, and be found by search (AC-05). Adding an Unsorted album to a list SHALL reuse its record and take it out of Unsorted.

#### Scenario: A new album in no list is in Unsorted
- **WHEN** an owner saves an album without a list
- **THEN** it appears in Unsorted and is counted among the collection's albums

#### Scenario: Unsorted albums are counted and searchable
- **WHEN** an owner removes an album from its only list
- **THEN** the collection's album count is unchanged, the Unsorted count grows by one, and searching for its title finds it

#### Scenario: Adding an Unsorted album to a list
- **WHEN** an owner adds an album from Unsorted to the list "Favorites"
- **THEN** "Favorites" holds the same record, and the album no longer appears in Unsorted

### Requirement: Removing a list keeps its albums
A list that goes to Trash, directly or inside a folder, SHALL take its entries out of effect but never its albums (FR-01.10). Its albums that are in other active lists SHALL stay there, and the rest SHALL appear in Unsorted. The entries SHALL be kept, so recovering the list can restore them (TS-13).

#### Scenario: A list in Trash
- **WHEN** "Kind of Blue" is in "Favorites" and "Late night", "Blue Train" is only in "Favorites", and "Favorites" goes to Trash
- **THEN** "Kind of Blue" is still in "Late night", "Blue Train" appears in Unsorted, and both albums are unchanged

### Requirement: List entries are limited to 50,000
An account SHALL hold at most 50,000 list entries, counting those whose list or album is in Trash until they are permanently removed (FR-15.4, TS-18, decided 22 October 2026). At the limit, only a new entry SHALL be rejected, with a clear reason; existing entries, albums and lists SHALL stay fully usable.

#### Scenario: Adding past the limit
- **WHEN** an account holds 50,000 list entries, some in a list in Trash, and the owner adds an album to another list
- **THEN** it is rejected as over the limit, and removing an entry or re-adding an album already in its list still works

### Requirement: Every saved album has a title, an artist and its year
Every saved album SHALL have a title, an artist credit and an applicable year (FR-02.6). A release that isn't live SHALL have its original release year. A live release SHALL have its recording year or range, or its original release year if the recording year is unknown. Creating an album without them, or an edit that would clear one, SHALL be rejected, naming each missing value. Missing values SHALL never be filled in.

#### Scenario: A new album needs the required information
- **WHEN** an album is saved with a blank title, or a blank artist, or no year
- **THEN** it is rejected, naming each missing value, and nothing is saved

#### Scenario: A live album's recording year is its year
- **WHEN** a live album is saved with a recording year and no original release year
- **THEN** it is saved, and its original release year stays unknown

#### Scenario: A recording year doesn't stand in for a studio album's year
- **WHEN** an album that isn't live, or isn't known to be live, is saved with only a recording year
- **THEN** it is rejected for its missing original release year

#### Scenario: Edits can't clear a required value
- **WHEN** an owner edits an album to clear its artist, or its only year
- **THEN** the edit is rejected and the saved album keeps its values

### Requirement: Albums are identified, not editions
Tonaris SHALL keep one record per album, whichever edition its links point to, and SHALL NOT store edition details such as an edition label or a barcode (FR-02.12). The canonical metadata source's album identity, when known, SHALL be the album's identity.

#### Scenario: No edition details are stored
- **WHEN** an album is saved
- **THEN** its record holds no edition label and no barcode

### Requirement: List entry changes reach every session of the owner
Each added or removed list entry SHALL reach the owner's other open sessions through their change stream, and be in the data a new session loads (FR-09.1, TS-23, TS-24).

#### Scenario: Another session sees an album added and removed
- **WHEN** an owner adds an album to a list in one session, then removes it, while another session of theirs is open
- **THEN** the other session shows the album in the list, then out of it, without reloading

### Requirement: Owners edit an album's title, artist and year in its row
In Editing mode on desktop, an owner SHALL edit an album's title, artist and year inline in its row, starting with Enter or a double-click on the cell, or F2 for the title (FR-03.1, DS-45). The year SHALL be the one the cell shows: the original year, a live album's recording year or range, or the release year it falls back to. Offline, cells SHALL not open for editing (DS-81).

#### Scenario: Retitling an album
- **WHEN** an owner in Editing mode presses Enter on an album's title, types "Nightfall (Remastered)" and presses Enter
- **THEN** the row shows the new title, and it is saved

#### Scenario: A live album's recording range
- **WHEN** an owner edits the year of a live album recorded in 1978 and enters "1978–1982"
- **THEN** its year reads "rec. 1978–1982"

### Requirement: Inline album edits follow the album rules
An inline value FR-02.6 or the year's format refuses SHALL keep the editor open with the reason, and send nothing (X-05). Each saved edit SHALL be made from the value it replaces, so an edit of a value changed elsewhere is a conflict for review (FR-09.4).

#### Scenario: A refused year
- **WHEN** an owner enters "nineteen" as an album's year
- **THEN** the editor stays open with "Enter the year as four digits, such as 1986.", and nothing is sent

### Requirement: The inspector shows an album
A click on an album's row or card, or Enter in Viewing mode, SHALL open the album inspector beside the view, at `?album={id}` (DS-46). It shows:
- the artwork and the title and artist;
- the chronology, with which year sorts;
- placeholders for links and custom fields;
- the lists the album is in, or Unsorted;
- when it was added.

Esc SHALL close it. With it open, J and K SHALL show the next or previous album. A change saved anywhere SHALL show in it live.

#### Scenario: Opening an album
- **WHEN** an owner clicks the album 'Nightfall' in the list 'Doom'
- **THEN** the inspector shows 'Nightfall', Candlemass, its year, and 'Doom' among its lists, and the address ends with `?album=` and its ID

#### Scenario: Moving through albums
- **WHEN** the inspector shows the first album of a list and the owner presses J
- **THEN** it shows the second

### Requirement: The inspector edits an album in Editing mode
In Viewing mode the inspector SHALL show values read-only (DS-45). In Editing mode it SHALL edit them: the title, artist, release type, Live, original year and recording year or range (FR-03.1). Each edit SHALL be one change from the values it replaces (TS-21), and SHALL appear in every list holding the album (FR-01.6).

#### Scenario: A live album in the inspector
- **WHEN** an owner in Editing mode switches Live on for an album from 1984 and enters the recording years "1978–1982"
- **THEN** the album shows "rec. 1978–1982" in every list it is in, and the hint says it sorts by the recording year

### Requirement: Album edits keep the required information
An edit in the inspector that FR-02.6 or a year's format refuses SHALL keep the field open with the reason, and send nothing (X-05). Required values SHALL never be invented: an edit that would leave an album without its applicable year SHALL be refused.

#### Scenario: Live off without an original year
- **WHEN** an owner switches Live off for a live album that has only a recording year
- **THEN** it is refused with "Give the album a year.", and Live stays on

### Requirement: The inspector puts an album in lists and takes it out
In Editing mode the inspector SHALL put the album in another of the owner's lists ("+ Add to list", or L), and take it out of one with its chip's ×, offering Undo (FR-01.6, FR-01.8, DS-50). Taking it out of its last list SHALL leave it in Unsorted.

#### Scenario: Taking an album out of its only list
- **WHEN** an owner removes 'Nightfall' from 'Doom', its only list, in the inspector
- **THEN** its lists show "Unsorted", 'Nightfall' is in Unsorted, and an Undo is offered

### Requirement: Albums are added by hand with their required information
The manual entry form SHALL show every album field: title, artist, release type, Live, original year, recording year or range, artwork, links, custom fields and a destination list, the latter four as placeholders until their features arrive (FR-02.4, AC-08). It SHALL require the title, the artist and the applicable year, showing each missing one at its field and in a summary, and SHALL save nothing incomplete or invented (FR-02.6).

#### Scenario: Required information
- **WHEN** an owner submits the form with only a title
- **THEN** the artist and the year are reported missing, and nothing is saved

#### Scenario: Into a list
- **WHEN** an owner in the list 'Doom' opens "Add album", enters 'Nightfall', Candlemass and 1987, and saves
- **THEN** 'Nightfall' appears in 'Doom'

#### Scenario: Unsaved input is kept
- **WHEN** an owner has typed a title and presses Esc
- **THEN** the form asks before discarding it

### Requirement: Enrichment fills only missing values
Enrichment, on capture, on a retry or from a newly matched link, SHALL fill only the album's values that are missing, and SHALL keep every populated value, whoever entered it, including a classification MusicBrainz disagrees with (FR-03.3, TS-42, AC-10). It SHALL keep an existing artwork URL (FR-03.4). What MusicBrainz lacks SHALL stay unknown (FR-02.8).

#### Scenario: A person's values are kept
- **WHEN** an owner's album has the title "Bleach", no release type and the original year 1990 they entered, and it is enriched from MusicBrainz's *Bleach* (Album, 1989)
- **THEN** its title and year stay as entered, and its release type becomes Album

#### Scenario: A conflicting classification is kept
- **WHEN** an album the owner marked as an EP is enriched from a release group MusicBrainz types as an Album
- **THEN** it stays an EP

#### Scenario: Enriching again changes nothing
- **WHEN** an album already enriched from its release group is enriched again from the same facts
- **THEN** nothing is written, and no change reaches the owner's sessions

#### Scenario: Artwork kept or added
- **WHEN** an album with no artwork, and another with an artwork URL, are enriched from a release group with a Cover Art Archive front
- **THEN** the first gets the front's address, and the second keeps its URL

#### Scenario: Missing facts stay unknown
- **WHEN** MusicBrainz has no first release date for an album
- **THEN** its original year stays unknown, and no year is invented

### Requirement: An album takes its release group's title, artist and first year
An album enriched from MusicBrainz SHALL take the release group's title and artist credit, and the year of its first release, whichever edition the link named (FR-02.12, TS-41, AC-09).

#### Scenario: A deluxe edition's album
- **WHEN** a new album is enriched from the release group a link to "Bleach (Deluxe Edition)" identified
- **THEN** it is *Bleach* by Nirvana, 1989

### Requirement: Classification follows MusicBrainz's types
Enrichment SHALL classify an album from its release group's types (FR-02.8, FR-05.9, TS-45). Album and EP map to themselves; Single, Broadcast and Other are Unclassified, whatever their secondary types (decided 24 October 2026). For an Album, an EP, or a release group with no primary type, the secondary type Compilation SHALL make it a compilation and Live SHALL make it live. Unknown types SHALL stay unknown.

#### Scenario: A live compilation
- **WHEN** an album is enriched from a release group typed Album, with the secondary types Compilation and Live
- **THEN** it is a live compilation, so it groups as Live

#### Scenario: A live single
- **WHEN** an album is enriched from a release group typed Single, with the secondary type Live
- **THEN** it is Unclassified and not live

#### Scenario: No types
- **WHEN** an album is enriched from a release group with no primary or secondary type
- **THEN** its release type and whether it is live stay unknown

### Requirement: A live album's recording years come from its recordings
For a live album, enrichment SHALL take the recording years from the earliest and latest dates of its recordings' "recorded at" and "recorded in" relationships, using the event's dates for a recording dated only through the event (FR-02.8, FR-05.5, TS-46). The recordings SHALL be those of the album's first official release. A range SHALL be filled whole, and only for an album that is live. Release dates SHALL never fill recording years (AC-14).

#### Scenario: A concert recorded on one night
- **WHEN** an album is enriched from *The Köln Concert*, recorded on 24 January 1975 and first released in 1975
- **THEN** its recording year is 1975, and its original year 1975

#### Scenario: A live album recorded over years
- **WHEN** an album is enriched from Bruce Springsteen's *Live/1975–85*
- **THEN** its recording years are 1975–1985

#### Scenario: A recording dated only through its event
- **WHEN** a live album's recordings have no dated relationships, and are recorded at an event of 1969
- **THEN** its recording year is 1969

#### Scenario: No recording dates
- **WHEN** a live album's recordings carry no dates
- **THEN** its recording years stay unknown, and it sorts by its original year with the fallback shown (FR-05.6)

#### Scenario: An album the owner says isn't live
- **WHEN** an album the owner marked as not live is enriched from a live release group with recording dates
- **THEN** it stays not live, and gets no recording years

### Requirement: Every metadata value records where it came from
Each saved metadata value SHALL record its source: `user` for what a person or their agent wrote, `musicbrainz` or `coverartarchive` for what enrichment filled, or `itunes-lookup` for Apple's hints a person kept (TS-15). An edit SHALL make the source `user`. Each source SHALL have policy flags for storing, agents and exports, and a value a policy withholds SHALL be marked as withheld, never dropped (FR-08.8).

#### Scenario: Enrichment's sources
- **WHEN** an album's year and artwork are filled from MusicBrainz and the Cover Art Archive
- **THEN** the year's source is `musicbrainz` with the release group's MBID, and the artwork's `coverartarchive`

#### Scenario: An edit is the person's
- **WHEN** an owner edits the year enrichment filled
- **THEN** the year's source is `user`

#### Scenario: Nothing is withheld today
- **WHEN** an album with values from every current source is prepared for an agent or an export
- **THEN** every value is included

#### Scenario: A withheld value is marked
- **WHEN** a policy withholds a source's values from exports, and an album with one of them is exported
- **THEN** that value is replaced by `"withheld": "provider-policy"`

### Requirement: Albums follow MusicBrainz's changed release group ids
When MusicBrainz answers an album's stored release group with another id, because it merged them, enrichment SHALL store the new id (FR-02.12, TS-44, decided 21 October 2026). When it answers that the release group no longer exists, the album SHALL keep all its data and no longer be identified.

#### Scenario: A merged release group
- **WHEN** an album saved with *Shoot for the Stars Aim for the Moon*'s release group `fcd3637b-3365-4780-802d-0013b070bca2` is enriched, and MusicBrainz now answers it as `d6d1de65-7e43-4277-b723-fc74a2b385e1`
- **THEN** the album's release group becomes `d6d1de65-7e43-4277-b723-fc74a2b385e1`

#### Scenario: A deleted release group
- **WHEN** an album's stored release group answers 404
- **THEN** the album keeps its title, artist, years and classification, and has no release group

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
