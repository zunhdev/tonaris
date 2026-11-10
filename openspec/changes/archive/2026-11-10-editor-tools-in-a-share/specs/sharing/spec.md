# Spec Delta

## ADDED Requirements

### Requirement: An editor's tools keep to the share
In a share the person edits, shortcuts and commands SHALL act on the share, Move to SHALL offer only its folders, and moving or deleting the shared folder or list itself SHALL say only its owner can, changing nothing (FR-07.19, FR-07.20).

#### Scenario: A new list by shortcut
- **WHEN** Anna presses N in the shared folder "Metal"
- **THEN** she is asked for the new list's name, and it is made in "Metal"

#### Scenario: Moving the share itself
- **WHEN** Anna opens Move to on "Metal" itself
- **THEN** it says only its owner can move it, and offers nowhere

#### Scenario: Moving inside
- **WHEN** Anna opens Move to on "Doom" inside "Metal"
- **THEN** it offers "Metal › Funeral" and not the top level or Denis's "Private"

### Requirement: An editor's deletions say what they do
An editor's deletion of a folder or list SHALL say only the owner can restore it after Undo, and of an album, that it leaves the share's lists while the owner's other lists keep it (FR-07.20, FR-07.21, X-07).

#### Scenario: Deleting an album
- **WHEN** Anna deletes "Nightfall" from "Metal", and Denis also has it in "Secret"
- **THEN** the confirmation says Denis's other lists keep it, and "Nightfall" is still in "Secret"

### Requirement: An editor's previews name nobody
An editor's move preview SHALL say only whether who can see it changes, never naming people or other shares (FR-07.14, FR-07.20).

#### Scenario: Into a folder shared with someone else
- **WHEN** Anna's move would make "Doom" visible to Ben through "Funeral"
- **THEN** her preview reads "Who can see it changes", without Ben's name
