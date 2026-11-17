## MODIFIED Requirements

### Requirement: Folders and lists have optional descriptions
A folder or list SHALL have an optional description in simple Markdown, which its owner SHALL set, change and clear as an ordinary change (FR-03.5). It SHALL be trimmed, empty text SHALL clear it, and it SHALL be at most 2,000 characters. A change SHALL apply only if the description is still the one the client saw (TS-21). It SHALL reach the owner's other sessions live, and SHALL show under the header and, as its first line, in its row (DS-41).

#### Scenario: Written and shown
- **WHEN** the owner describes the list "Grunge" as "Seattle, 1988 to 1994"
- **THEN** the list's page shows it under its name, and its folder's row shows it after the name

#### Scenario: Too long
- **WHEN** the owner enters 2,001 characters
- **THEN** the description is refused with "Descriptions can be at most 2,000 characters.", and the text stays for correcting

## ADDED Requirements

### Requirement: Descriptions render simple Markdown
A description SHALL render bold, italic, bulleted and numbered lists, and links whose address is http or https, opening in a new tab; any other text SHALL show as written, line breaks kept (FR-03.5, TON-292). A row SHALL show its first line without the marks. Exports SHALL keep the text as written.

#### Scenario: Rendered
- **WHEN** a description reads "**Start** with *The Seer*" and, on the next line, "- Filth"
- **THEN** "Start" is bold, "The Seer" italic, and "Filth" a list item, and the row shows "Start with The Seer"

#### Scenario: Not a web link
- **WHEN** a description holds "[x](javascript:alert(1))"
- **THEN** it shows as written, with no link

### Requirement: A description reads in three lines and More
Under a folder's or list's header, a description SHALL show its first three lines, fading out, with More to show the rest in place, and SHALL scroll with the folder's or list's contents (DS-41, TON-292). Shared and guest pages SHALL show it the same way.

#### Scenario: A long description
- **WHEN** a list's description is ten lines long
- **THEN** its page shows three lines and More, and More shows all ten

### Requirement: A description is written in a side panel
In Editing mode, the header's Description, or a click on the description, SHALL open a panel where the album panel opens, with the text, a count, and buttons for the marks (DS-41, TON-292). The text under the header SHALL follow the typing. Done, Esc, closing the panel or leaving Editing mode SHALL save it, unless it is over the limit.

#### Scenario: Written in the panel
- **WHEN** the owner opens Description, types two lines and presses Done
- **THEN** the panel closes and the list's page shows both lines
