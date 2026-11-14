## ADDED Requirements

### Requirement: Selected albums are acted on together
In Editing mode on a computer, a person SHALL select albums in a list or Unsorted by X, ⇧↑ and ⇧↓, or by their checkboxes, and SHALL see how many are selected. Add to list, removing from the list on view and deleting SHALL then act on all of them in one batch; adding and removing SHALL offer Undo, and deleting SHALL be confirmed first (DS-21, DS-45, DS-50, DS-78).

#### Scenario: Removing several from a list
- **WHEN** the owner selects three albums in the list "Doom" and presses ⌫
- **THEN** all three leave "Doom" in one batch, stay in the collection, and a toast offers Undo

#### Scenario: Deleting several
- **WHEN** the owner selects two albums and presses ⌘⌫, then confirms
- **THEN** both move to Trash, each its own unit, in one batch
