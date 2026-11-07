# Spec Delta

## MODIFIED Requirements

### Requirement: Lists and Unsorted can show their albums as a grid
Lists and Unsorted SHALL offer a grid of album cards as well as rows (DS-22, DS-40). Each card shows the artwork, title, artist and year, the services the album has links for, and its save state. The layout SHALL be chosen in View options and remembered with the view's other choices (FR-11.8).

#### Scenario: Switching to the grid
- **WHEN** an owner chooses Grid in a list's View options and reloads the page
- **THEN** the list shows its albums as cards, and Unsorted still shows rows

#### Scenario: A layout kept on the device
- **WHEN** an owner had chosen Grid for a list on this device before layouts were saved to the account, and opens the workspace
- **THEN** the list shows cards, and the choice is saved to the account

#### Scenario: A card's links
- **WHEN** an album in a list's grid has Spotify and Apple Music links
- **THEN** its card reads "Spotify · Apple Music" under the year

### Requirement: Folders and the root show their folders and lists
A folder and the root SHALL show the folders and lists they hold as cards or rows, as the view's layout says, in the view's sort order (DS-41, FR-05.1). Each row shows the folder or list icon, its name, and its count: albums for a list, folders and lists for a folder. Sorted by creation date, the rows SHALL also show the date each was created. Opening a row SHALL open that folder or list.

#### Scenario: A folder's contents
- **WHEN** an owner opens the folder 'Metal' holding the folder 'Funeral' and the list 'Doom' with 2 albums
- **THEN** the view shows a row for each, with their counts, and opening 'Doom' shows the list

#### Scenario: Sorted by creation date
- **WHEN** an owner sorts the root by Created
- **THEN** each row shows the date its folder or list was created

### Requirement: View options set a view's presentation
Every collection view SHALL have a View button, also opened with `V`, for its options (DS-49):
- the sort;
- the direction, disabled for manual order;
- for lists and Unsorted, the grouping;
- the layout.

"Use account defaults" SHALL clear the view's remembered choices, and "Save as my default" SHALL make its choices the account defaults. Choosing options SHALL work offline.

#### Scenario: Opening with V
- **WHEN** an owner presses V in a list
- **THEN** the list's View options open, with its current sort, direction, grouping and layout chosen

#### Scenario: Direction for manual order
- **WHEN** an owner chooses Manual in View options
- **THEN** the direction can't be changed

### Requirement: Account defaults apply where no choice was made
Signed-in people SHALL have account defaults: the sort and direction for lists and Unsorted, the sort and direction for folders and the root, the grouping, and a layout for each (FR-11.7, DS-94). Until changed, they are Year ascending, combined and Rows for lists and Unsorted, and Manual and Grid for folders and the root (DS-44, FR-05.10, TON-174). Changing a default SHALL never change a remembered choice.

#### Scenario: A default for unvisited views
- **WHEN** an owner sets the default sort for lists to Name in Settings → Preferences
- **THEN** a list they never changed is sorted by Name, and a list they sorted by Year stays sorted by Year

#### Scenario: Saving a view's choices as the default
- **WHEN** an owner groups Unsorted by release type and chooses "Save as my default"
- **THEN** lists without a remembered grouping are grouped by release type too

## ADDED Requirements

### Requirement: Folder cards fan their first covers
In Grid, each folder's or list's card SHALL fan its first three covers: a list's first albums as its person presents it, a folder's the first found in its folders and lists, top to bottom; with its name and count (DS-41, TON-174). An empty one SHALL show its icon. Cards SHALL open their folder or list, and the arrows, Enter, and ⌥↑ and ⌥↓ under Manual SHALL work as on album cards.

#### Scenario: A list and a subfolder
- **WHEN** an owner opens 'Classic Rock', holding 'Led Zeppelin' with four albums from 1969 to 2012, the empty 'The Who', and the folder 'Prog' whose list 'Yes' has two albums
- **THEN** 'Led Zeppelin' fans its first three by year, the first in front, and reads "4 albums"; 'The Who' shows the list icon; 'Prog' fans the two from 'Yes' and reads "1 folder or list"

#### Scenario: Walking and opening
- **WHEN** the owner focuses 'Led Zeppelin', presses → and then Enter
- **THEN** 'The Who' opens

#### Scenario: Rows for one folder
- **WHEN** the owner chooses Rows in 'Classic Rock''s View options and reloads
- **THEN** 'Classic Rock' shows rows, and its parent 'Rock' still shows cards
