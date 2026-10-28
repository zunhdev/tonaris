# custom-fields Specification

## Purpose
Account-level custom fields that add personal context to albums: their definitions and names, and, as M4 goes on, their per-album values, options, type changes and deletion (FR-03.6–FR-03.18, X-06, X-09).

## Requirements

### Requirement: Owners define custom fields of six types
An owner SHALL define custom fields at account level, of type text, number, date, yes/no, single choice or multiple choice (FR-03.6). A choice field SHALL take its initial options in the definition; another type SHALL take none. Defining a field SHALL apply it to no album. There SHALL be no predefined fields. An account SHALL have at most 50 fields, and a choice field at most 100 options (TS-18).

#### Scenario: A choice field with options
- **WHEN** an owner defines the single-choice field "Mood" with the options "Calm" and "Loud"
- **THEN** the account has the field "Mood" with those options, in that order, and no album uses it

#### Scenario: Options on a field that takes none
- **WHEN** an owner defines a number field with options
- **THEN** it is refused, and nothing is defined

#### Scenario: Past the limit
- **WHEN** an owner with 50 fields defines another
- **THEN** it is refused with the limit as its reason, and the 50 fields stay

### Requirement: Field names and option labels are unique, case-insensitively
Field names SHALL be unique within an account across all types, and option labels within their field, compared case-insensitively, with the spelling chosen kept (FR-03.9, FR-03.14, X-06). Names and labels SHALL NOT be blank, and SHALL have at most 200 characters. Different accounts and different fields MAY reuse names and labels.

#### Scenario: The same name in another type
- **WHEN** an account has the number field "Rating" and its owner defines the single-choice field "rating"
- **THEN** it is refused as a name already used, and nothing changes

#### Scenario: Two options with one label
- **WHEN** an owner defines a choice field with the options "Calm" and "calm"
- **THEN** it is refused, and nothing is defined

#### Scenario: Another account
- **WHEN** another account already has a field "Rating"
- **THEN** this owner can define "Rating" too

### Requirement: Renaming a field changes it everywhere and nothing else
Renaming a field SHALL change the one definition across the account, albums in Trash included, without changing its type, options, usage or values (FR-03.11, X-09). A case-only rename SHALL be allowed and keep the new spelling. A rename made over a name changed elsewhere SHALL be a conflict (TS-21).

#### Scenario: A rename reaches albums in Trash
- **WHEN** a field used by an album in Trash is renamed from "Rating" to "Score"
- **THEN** that album's value is kept, under the field now named "Score"

#### Scenario: A case-only rename
- **WHEN** an owner renames "rating" to "Rating"
- **THEN** the field is named "Rating"

#### Scenario: Renamed elsewhere
- **WHEN** a session renames "Rating" to "Score" while another, still showing "Rating", renames it to "Stars"
- **THEN** the second rename is a conflict, and the field stays "Score"

### Requirement: Field definitions reach every session of the owner
Field definitions, with their options in order, SHALL reach every session of the owner: in the data a session loads, and as they change (FR-09.1, X-08).

#### Scenario: Defined in another session
- **WHEN** an owner defines a field in one session
- **THEN** their other open sessions have it without reloading

### Requirement: Albums apply fields, and applied-empty stays apart from unused
An owner SHALL apply any of their fields to an album, and SHALL remove it (FR-03.7, FR-03.8). Values SHALL be per album, shared by every list it is in. An applied field MAY be empty, and an empty value SHALL stay apart from an unused field, from zero and from No: it SHALL never be replaced with a default. Removing a field from an album SHALL clear its value, and applying it again SHALL start empty. Other albums and the definition SHALL be unaffected.

#### Scenario: Applied but empty
- **WHEN** an owner applies the number field "Rating" to an album and enters nothing
- **THEN** the album shows "Rating" as applied and empty, not 0 and not absent

#### Scenario: Removed and applied again
- **WHEN** an album's "Rating" is 4, and the owner removes the field and applies it again
- **THEN** "Rating" is applied and empty

#### Scenario: Yes, No and empty
- **WHEN** an owner applies the yes/no field "Owned" and leaves it empty
- **THEN** it is neither Yes nor No

### Requirement: Values are validated by their field's type
A value SHALL be accepted only as its field's type allows (FR-03.10): text, of at most 2,000 characters; a valid number; a valid calendar date; Yes or No; at most one existing option; or a set of existing options without repeats. An invalid value SHALL be refused with its reason, nothing SHALL change, and the input SHALL stay for correcting (X-05).

#### Scenario: Not a number
- **WHEN** an owner enters "four" in a number field
- **THEN** it is refused with the reason, and the field keeps its value

#### Scenario: Not a calendar date
- **WHEN** an owner enters "2026-02-30" in a date field
- **THEN** it is refused, and nothing changes

#### Scenario: Another field's option
- **WHEN** a single-choice value names an option that isn't the field's
- **THEN** it is refused, and nothing changes

#### Scenario: A repeated option
- **WHEN** a multiple-choice value names the same option twice
- **THEN** it is refused, and nothing changes

### Requirement: Values reach every session and change by compare-and-set
Field values SHALL reach every session of the owner, in the data a session loads and as they change (FR-09.1). A value set over one changed elsewhere since the person saw it SHALL be a conflict, and nothing SHALL change (TS-21).

#### Scenario: Changed elsewhere
- **WHEN** a session sets "Rating" to 5 while another, still showing 4, sets it to 3
- **THEN** the second is a conflict, and "Rating" stays 5

### Requirement: A field's type changes only while no album uses it
An owner SHALL change a field's type only while no album uses it; an album in Trash and an applied-empty field SHALL count as using it (FR-03.12). A refused change SHALL say how many albums use the field, in Trash included, and that a new field of the wanted type can be created instead. Values SHALL never be cleared, usage removed or data converted to make a change possible. An allowed change SHALL keep the field, its ID and its name.

#### Scenario: Used, even empty
- **WHEN** one album applies "Rating" without a value, and the owner changes "Rating" from number to text
- **THEN** the change is refused with `field_in_use`, and the field and the album's usage are unchanged

#### Scenario: Used only in Trash
- **WHEN** the only album applying "Rating" is in Trash, and the owner changes its type
- **THEN** the change is refused, naming the album in Trash

#### Scenario: Unused
- **WHEN** no album applies "Rating", and the owner changes it from number to text
- **THEN** "Rating" is a text field, with the same ID and name

### Requirement: Options follow a type change as far as they can
A change between single and multiple choice SHALL keep the options, in order (FR-03.13). A change from a choice type to any other SHALL discard the options and report which were discarded. Changing back SHALL NOT restore them.

#### Scenario: Single to multiple choice
- **WHEN** an unused single-choice field "Mood" with "Calm" and "Loud" becomes multiple choice
- **THEN** it keeps "Calm" and "Loud"

#### Scenario: Choice to text and back
- **WHEN** an unused "Mood" with "Calm" becomes text, and then single choice again
- **THEN** the first change reports "Calm" as discarded, and "Mood" then has no options

### Requirement: Options are added with labels unique per field
An owner SHALL add options to a choice field, at the end, available to every album and chosen by none (FR-03.15). Labels SHALL be unique within a field, ignoring case, and trimmed, non-blank and at most 200 characters (FR-03.14, X-06). A field SHALL have at most 100 options, and only choice fields SHALL have them.

#### Scenario: A label in use
- **WHEN** "Mood" has "Calm", and the owner adds "calm"
- **THEN** the option is refused with `name_conflict`, and "Mood" is unchanged

### Requirement: A renamed option keeps its selections
An owner SHALL rename an option; it SHALL stay the same option, with every selection, and the new label SHALL appear wherever it is shown (FR-03.16). The new label SHALL meet the same rules as an added one. A rename SHALL apply only if the label is still the one the client saw (TS-21).

#### Scenario: A rename keeps the selections
- **WHEN** three albums chose "Calm", and the owner renames it "Quiet"
- **THEN** the three albums have "Quiet", as the same option

#### Scenario: A removed option's label
- **WHEN** an owner removes "Calm" and adds "Calm" again
- **THEN** the new option has a new ID, and no album that chose the old one chooses it

### Requirement: Removing a used option is confirmed for its scope
Removing an option no album chooses SHALL be an ordinary change (FR-03.17). Removing an option that any album chooses, in Trash included, SHALL be confirmed (X-07): the server computes its scope, the albums choosing it, active and in Trash, and SHALL remove the option only with the hash of that scope as it is when removing (TS-14).

#### Scenario: Unused
- **WHEN** no album chooses "Loud", and the owner removes it
- **THEN** "Loud" is removed without a confirmation

#### Scenario: Used, without confirmation
- **WHEN** two albums choose "Calm", and the owner removes it without the scope's hash
- **THEN** the removal is refused with `field_in_use`, and nothing changes

#### Scenario: The scope changed after confirming
- **WHEN** the owner confirms removing "Calm" from two albums, and a third chooses it before the removal runs
- **THEN** the removal is refused with `field_in_use`, and nothing changes

### Requirement: A removed option is cleared everywhere
Removal SHALL clear the option from every album that chose it. A single choice SHALL become empty, a multiple choice SHALL keep its other selections, and an album losing its last selection SHALL keep the field applied and empty. No value SHALL refer to a removed option, and recovering an album from Trash SHALL NOT bring a removed option or a cleared value back (X-09).

#### Scenario: Confirmed, single choice
- **WHEN** an album's single-choice "Mood" is "Calm", and the owner confirms removing "Calm"
- **THEN** the album's "Mood" is applied and empty, and "Calm" is gone

#### Scenario: Confirmed, multiple choice
- **WHEN** one album's multiple-choice "Tags" is "Live" and "Odd", another's is "Live" alone, and the owner confirms removing "Live"
- **THEN** the first album's "Tags" is "Odd", and the second's is applied and empty

#### Scenario: In Trash
- **WHEN** an album in Trash chooses "Calm", the owner confirms its removal, and then recovers the album
- **THEN** the recovered album has the field applied and empty
