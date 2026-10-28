## ADDED Requirements

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
