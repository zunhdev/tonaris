## ADDED Requirements

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
