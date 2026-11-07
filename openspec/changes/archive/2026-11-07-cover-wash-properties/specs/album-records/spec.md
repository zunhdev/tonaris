# Spec Delta

## ADDED Requirements

### Requirement: The inspector takes its cover's color
The album inspector's top SHALL take the cover's main hue, at a fixed lightness and capped chroma, fading into the panel behind its content (FR-03.4, DS-46, TON-173). Every text color, a field's placeholder included, SHALL keep 4.5:1 on it for every hue (DS-14). An album without artwork, or whose cover can't be read, SHALL keep the plain panel.

#### Scenario: A green cover
- **WHEN** an owner opens an album whose cover is green
- **THEN** the panel's top is washed in a dark green that fades out down the panel

#### Scenario: No artwork
- **WHEN** the owner then opens an album without artwork
- **THEN** the panel has no wash

### Requirement: The inspector gathers its facts under Properties
The album inspector SHALL end with a Properties block of read-only facts, labels beside values: in Viewing mode the release type, whether it is live, its years and which year sorts it; in both modes when it was added, how many lists it is in, and the services it has links for (DS-46, TON-173). A thin line SHALL divide each section from the one above.

#### Scenario: Viewing mode
- **WHEN** an owner views the album 'Nightfall' (1987, in one list, no links)
- **THEN** Properties reads Release type Album, Live No, Original release year 1987, Added with its date, In lists 1, Links None, and no Chronology section shows

#### Scenario: Editing mode
- **WHEN** the owner switches to Editing mode
- **THEN** Chronology's fields show above, and Properties reads Added, In lists and Links
