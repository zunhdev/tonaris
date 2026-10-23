# Spec Delta

## ADDED Requirements

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
