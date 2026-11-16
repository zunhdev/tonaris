## MODIFIED Requirements

### Requirement: A folder or list card gives a long name a second line
A folder's or list's card, in the workspace and on guest pages, SHALL show its name on up to two lines, its icon in the first and a second line from the card's edge, ending in an ellipsis only when two lines don't hold it (DS-41, TON-283, TON-285). The count SHALL follow right under the name, from the card's edge, with the sharing glyph after it. In the workspace, a row of cards SHALL be a line taller only when one of its names takes two lines.

#### Scenario: A long name in a folder
- **WHEN** an owner opens a folder holding the lists 'IVE' and '2nd Generation (2003–2011)' as cards
- **THEN** '2nd Generation (2003–2011)' takes two lines and 'IVE' one, and each count follows right under its name

#### Scenario: Rows of short names
- **WHEN** one row of cards holds only short names and the next holds '2nd Generation (2003–2011)'
- **THEN** the first row is a line shorter than the second

#### Scenario: Lined up with the cover
- **WHEN** '2nd Generation (2003–2011)' takes two lines
- **THEN** its second line and its count start at the card's left edge, under its icon
