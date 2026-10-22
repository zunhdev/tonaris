# views-and-ordering Specification

## Purpose
How folders, lists and Unsorted present what they hold: albums as rows or a grid of cards, folders and lists as rows, smooth at the collection's size, and later in which order (FR-05).

## Requirements

### Requirement: Lists and Unsorted show their albums as rows
A list SHALL show the albums it holds, and Unsorted the albums in no list, one row each (FR-05, FR-01.9, DS-21). A row shows the album's artwork, title, artist, year and release type, and its save state. Until sorting exists (TON-35), albums SHALL come in chronological order: the recording year for live albums with one, otherwise the original year, earliest first, with unknown years last (FR-05.5, DS-44).

#### Scenario: A list's albums
- **WHEN** an owner opens a list holding 'Nightfall' (1987) and 'Epicus Doomicus Metallicus' (1986)
- **THEN** the view shows 'Epicus Doomicus Metallicus' first, then 'Nightfall', each with its artist, year and type

#### Scenario: Unsorted
- **WHEN** an owner has an album in no list and opens Unsorted
- **THEN** the album is shown there, and not in any list's view

### Requirement: Lists and Unsorted can show their albums as a grid
Lists and Unsorted SHALL offer a grid of album cards as well as rows (DS-22, DS-40). Each card shows the artwork, title, artist and year, and its save state. The choice SHALL be kept per view on the device (decided 22 October 2026). Folders and the root SHALL always show rows.

#### Scenario: Switching to the grid
- **WHEN** an owner switches a list to Grid and reloads the page
- **THEN** the list shows its albums as cards, and Unsorted still shows rows

### Requirement: Folders and the root show their folders and lists
A folder and the root SHALL show the folders and lists they hold as rows, in creation order until manual order exists (DS-41, DS-44). Each row shows the folder or list icon, its name, and its count: albums for a list, folders and lists for a folder. Opening a row SHALL open that folder or list.

#### Scenario: A folder's contents
- **WHEN** an owner opens the folder 'Metal' holding the folder 'Funeral' and the list 'Doom' with 2 albums
- **THEN** the view shows a row for each, with their counts, and opening 'Doom' shows the list

### Requirement: Artwork falls back to a tile
Album artwork SHALL show as a fixed square (DS-23). An album without artwork, or whose artwork is loading or fails to load, SHALL show a tile with the title's first letter on a calm hue derived from the title. A failed image SHALL never show as an error.

#### Scenario: No artwork yet
- **WHEN** an album has no artwork
- **THEN** its row and card show its tile, the same tile for the same title

### Requirement: Collection views are grids for the keyboard and assistive technology
Each collection view SHALL be an ARIA grid that states its full number of rows (and of columns for cards), even when only some are rendered (DS-115). The keys move focus between cells:
- the arrows;
- J and K, for the next and previous row;
- Home and End, within the row;
- ⌘Home and ⌘End, to the first and last;
- Page Up and Page Down.

Enter on a folder or list SHALL open it.

#### Scenario: Walking the grid of cards
- **WHEN** an owner focuses the first card of a list in Grid and presses → then ↓
- **THEN** focus moves to the second card, then to the card below it

#### Scenario: Rows by keyboard
- **WHEN** an owner focuses the first row of a folder's view and presses J then Enter
- **THEN** the second folder or list opens

### Requirement: Large collections stay smooth
Views SHALL render only the rows in view and a margin around them, so a list of 5,000 albums scrolls smoothly in both layouts (Q-01, DS-106). Saving or changing an album elsewhere SHALL update its row or card in place.

#### Scenario: 5,000 albums
- **WHEN** an owner opens Unsorted holding 5,000 albums and presses ⌘End
- **THEN** the view states 5,000 albums to assistive technology, renders only a few dozen, and shows the last album
