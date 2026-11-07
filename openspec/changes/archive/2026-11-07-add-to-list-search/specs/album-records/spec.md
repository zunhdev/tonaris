# Spec Delta

## ADDED Requirements

### Requirement: Add to a list finds lists by typing
"Add to a list" SHALL find the owner's lists by typing: each typed word in the list's path, its folders' names or its own, matched as search matches (FR-01.6, FR-12.5, DS-46, TON-177). Lists whose name matches come first, and at most 50 SHALL show. Before typing, it SHALL show 8: the lists albums were most recently added to, then others by path.

#### Scenario: A folder's word and a name's
- **WHEN** an owner types "2000 ЗЕМФ" in "Add 'Nightfall' to a list"
- **THEN** "Русский рок › 4 2000-2010-е › Земфира" is offered, and Enter adds 'Nightfall' to it

#### Scenario: Recent before typing
- **WHEN** an owner with 11 other lists, the last album added to 'Mix 5', opens "Add 'Nightfall' to a list"
- **THEN** 'Mix 5' shows under "Recent", 8 lists show, and "Type to find the other 3 lists." counts the rest
