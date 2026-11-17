## MODIFIED Requirements

### Requirement: Listings come in the person's order, in pages
Folder, list, Unsorted and Trash listings SHALL come in pages of at most 200 with an opaque cursor and the total (TS-63, TS-65). Folders and lists SHALL follow the person's manual order, then creation; a list's albums manual order, then when they were added; Unsorted manual order, then newest first; Trash oldest first. The overview SHALL give the counts, usage against each limit with Trash included, and the folder tree breadth-first, so an agent plans without listing every album.

#### Scenario: Manual order
- **WHEN** a list's albums were added as First, Second, Third, and the person placed Third, then First at the top
- **THEN** the agent lists Third, First, Second

#### Scenario: Paging
- **WHEN** an agent lists a list of 205 albums
- **THEN** it gets 200 with a cursor, then the other 5 with none, and a cursor it made up is refused

#### Scenario: Usage
- **WHEN** a collection has one active album and one in Trash
- **THEN** the overview counts 1 album and 2 of the 50,000 album limit
