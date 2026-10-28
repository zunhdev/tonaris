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

### Requirement: Deleting a field is always confirmed for its scope
Deleting a field SHALL always be confirmed, even when no album uses it (FR-03.18, X-07). The server SHALL compute its scope: the definition, its options, and the albums applying it, active and in Trash. It SHALL delete the field only with the hash of that scope as it is when deleting (TS-14). Shared-view effects SHALL join the scope with sharing.

#### Scenario: Unused, confirmed
- **WHEN** no album applies "Rating", and the owner confirms its deletion
- **THEN** "Rating" is gone

#### Scenario: The scope changed after confirming
- **WHEN** the owner confirms deleting "Mood" while two albums apply it, and a third applies it before the deletion runs
- **THEN** the deletion is refused with `field_in_use`, and nothing changes

### Requirement: Deletion removes every use, and recovery never brings it back
Deleting a field SHALL remove its definition, its options, and every album's usage and value, active and in Trash, in one transaction. No album data SHALL refer to it afterwards. Recovering an album from Trash SHALL NOT bring the field, its options or its values back (X-09). A name the field had SHALL be free for a new field, which SHALL NOT inherit anything.

#### Scenario: Used, in Trash too
- **WHEN** an active album and an album in Trash have "Mood" values, and the owner confirms deleting "Mood"
- **THEN** neither album applies "Mood", and its options are gone

#### Scenario: Recovered from Trash
- **WHEN** an album in Trash had "Mood", the owner deletes "Mood", and then recovers the album
- **THEN** the album has no "Mood"

#### Scenario: The name again
- **WHEN** the owner deletes "Mood" and creates a field named "Mood"
- **THEN** the new field is applied to no album

### Requirement: Settings lists the fields with their usage
Settings → Custom fields SHALL list the owner's fields by name, with each one's type, number of options, and the albums using it, active and in Trash (DS-60). It SHALL offer creating a field, and every change TON-49 to TON-52 allow: renaming, changing the type, adding, renaming and removing options, and deleting. Each SHALL work by keyboard alone.

#### Scenario: Usage with Trash
- **WHEN** "Rating" is applied to 214 albums, 3 of them in Trash
- **THEN** its row says "Used by 214 albums · 3 in Trash"

#### Scenario: By keyboard
- **WHEN** the owner tabs to a field's row and opens it with Enter
- **THEN** its name, type, options and Delete field can each be reached and used without a pointer

### Requirement: A used field's type select explains why it is locked
For a field any album uses, in Trash or not, even empty, the type select SHALL be disabled with the usage and the advice to create a new field of the wanted type, and a button that opens the create dialog (FR-03.12). A change from a choice type to any other SHALL first list the options it discards, and SHALL happen only when the owner goes ahead (FR-03.13).

#### Scenario: Used
- **WHEN** the owner opens "Rating", used by 3 albums
- **THEN** the type select is disabled, saying "Used by 3 albums. Create a new field of the type you need instead.", next to **Create new field**

#### Scenario: Discarding options
- **WHEN** the owner chooses Text for an unused "Mood" with "Calm" and "Loud"
- **THEN** the panel lists "Calm" and "Loud" as discarded, and the type changes only with **Change type**

### Requirement: Confirmed field operations use the standard confirmation dialog
Removing a used option and deleting a field SHALL open the standard confirmation dialog (DS-28, X-07). It SHALL name the action and target, show the scope with counts, active and in Trash, and say that it can't be undone. Cancel SHALL have the focus, and the action button SHALL send exactly the scope shown. Removing an unused option SHALL need no dialog (FR-03.17).

#### Scenario: Removing a used option
- **WHEN** the owner removes "Calm", chosen on 2 albums, 1 in Trash
- **THEN** a dialog titled "Remove option 'Calm'?" shows those counts, and the option goes only when confirmed

#### Scenario: Deleting an unused field
- **WHEN** the owner deletes "Rating", used by no album
- **THEN** a dialog titled "Delete field 'Rating'?" still asks first, saying it can't be undone
