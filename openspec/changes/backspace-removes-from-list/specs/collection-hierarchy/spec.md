## ADDED Requirements

### Requirement: ⌫ removes the focused album from the list on view
In a list, ⌫ on a focused album SHALL take it out of that list, switching to Editing mode, and SHALL keep it in the collection. A toast SHALL offer Undo. ⌫ on a focused folder or list SHALL still delete it, and ⌫ on an album outside a list SHALL do nothing (DS-45, DS-50, DS-78).

#### Scenario: Removing from a list
- **WHEN** the owner focuses an album in the list "Doom" and presses ⌫
- **THEN** the album leaves "Doom", stays in the collection, and a toast reads "Removed from Doom" with Undo

#### Scenario: Undo
- **WHEN** the owner chooses Undo on that toast
- **THEN** the album is back in "Doom"
