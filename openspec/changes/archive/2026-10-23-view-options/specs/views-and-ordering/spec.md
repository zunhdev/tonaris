# Spec Delta

## MODIFIED Requirements

### Requirement: Lists and Unsorted show their albums as rows
A list SHALL show the albums it holds, and Unsorted the albums in no list, one row each (FR-05, FR-01.9, DS-21). A row shows the album's artwork, title, artist, year and release type, and its save state. The release type SHALL be hidden while the view is grouped by release type. Albums SHALL come in the view's sort order (FR-05.1).

#### Scenario: A list's albums
- **WHEN** an owner who hasn't changed any view option opens a list holding 'Nightfall' (1987) and 'Epicus Doomicus Metallicus' (1986)
- **THEN** the view shows 'Epicus Doomicus Metallicus' first, then 'Nightfall', each with its artist, year and type

#### Scenario: Unsorted
- **WHEN** an owner has an album in no list and opens Unsorted
- **THEN** the album is shown there, and not in any list's view

### Requirement: Lists and Unsorted can show their albums as a grid
Lists and Unsorted SHALL offer a grid of album cards as well as rows (DS-22, DS-40). Each card shows the artwork, title, artist and year, and its save state. The layout SHALL be chosen in View options and remembered with the view's other choices (FR-11.8). Folders and the root SHALL always show rows.

#### Scenario: Switching to the grid
- **WHEN** an owner chooses Grid in a list's View options and reloads the page
- **THEN** the list shows its albums as cards, and Unsorted still shows rows

#### Scenario: A layout kept on the device
- **WHEN** an owner had chosen Grid for a list on this device before layouts were saved to the account, and opens the workspace
- **THEN** the list shows cards, and the choice is saved to the account

### Requirement: Folders and the root show their folders and lists
A folder and the root SHALL show the folders and lists they hold as rows, in the view's sort order (DS-41, FR-05.1). Each row shows the folder or list icon, its name, and its count: albums for a list, folders and lists for a folder. Sorted by creation date, the rows SHALL also show the date each was created. Opening a row SHALL open that folder or list.

#### Scenario: A folder's contents
- **WHEN** an owner opens the folder 'Metal' holding the folder 'Funeral' and the list 'Doom' with 2 albums
- **THEN** the view shows a row for each, with their counts, and opening 'Doom' shows the list

#### Scenario: Sorted by creation date
- **WHEN** an owner sorts the root by Created
- **THEN** each row shows the date its folder or list was created

## ADDED Requirements

### Requirement: Albums sort by year, name or manual order
Lists and Unsorted SHALL sort their albums by year, by name or in manual order (FR-05.1, FR-05.4). Year and name SHALL sort ascending or descending. Manual order SHALL be the person's arrangement. Before anyone arranges, it is the order albums were added to a list, and in Unsorted the newest first (DS-44, DS-51).

#### Scenario: By name, descending
- **WHEN** an owner sorts a list holding 'Ancient Dreams', 'Nightfall' and 'Tales of Creation' by Name, descending
- **THEN** the list shows 'Tales of Creation', 'Nightfall', then 'Ancient Dreams'

#### Scenario: Manual before arranging
- **WHEN** an owner adds 'Nightfall' and then 'Ancient Dreams' to a list and sorts it by Manual
- **THEN** the list shows 'Nightfall', then 'Ancient Dreams'

### Requirement: Folders sort by name, creation date or manual order
Folders and the root SHALL sort their folders and lists by name, by creation date or in manual order (FR-05.1, FR-05.3). Name and creation date SHALL sort ascending or descending, with folders first and then lists, each in that order (DS-42). Manual order SHALL be one mixed sequence: the person's arrangement, or creation order before they arrange (DS-44).

#### Scenario: Folders first
- **WHEN** an owner sorts the root holding the list 'Later' and the folders 'Metal' and 'Archive' by Name
- **THEN** the root shows 'Archive', 'Metal', then 'Later'

#### Scenario: Manual before arranging
- **WHEN** an owner creates the list 'Later', then the folder 'Metal', and the root is in manual order
- **THEN** the root shows 'Later', then 'Metal'

### Requirement: Albums sort by their chronological year
Sorting by year SHALL use each album's chronological year (FR-05.5, FR-05.6). Non-live albums use their original release year. Live albums use their recording year, or the first year of a recording range, in both directions. Live albums with an unknown recording year use their original release year. A reissue's year SHALL never be used.

#### Scenario: Live albums by recording year
- **WHEN** a list holds the live album 'Live at the Rainbow', recorded 1978–1982 and released 1984, and the studio album 'Heaven and Hell' from 1980, sorted by year ascending
- **THEN** 'Live at the Rainbow' comes first, sorted as 1978

#### Scenario: Unknown recording year
- **WHEN** a live album released in 1979 has no recording year
- **THEN** it sorts as 1979

### Requirement: The year shows how it was decided
The year in rows and cards SHALL show which year an album sorts by (DS-24, AC-14). A live album's recording year or full range SHALL carry a `rec.` prefix. A live album with an unknown recording year SHALL show its release year with a fallback marker, labelled "Recording year unknown — sorted by release year" for pointer and assistive technology alike.

#### Scenario: A recording range
- **WHEN** a list shows a live album recorded 1978–1982
- **THEN** its year reads "rec. 1978–1982"

#### Scenario: The release-year fallback
- **WHEN** a list shows a live album released in 1979 with no recording year
- **THEN** its year reads 1979 with the fallback marker, and its accessible label says "Recording year unknown — sorted by release year"

### Requirement: Lists and Unsorted can be grouped by release type
Lists and Unsorted SHALL show their albums combined or grouped by release type (FR-05.7, FR-05.9, DS-43). Groups come in one fixed sequence: Album, EP, Live, Compilation, then Unclassified. Live SHALL take priority over the other types. Singles and unknown types SHALL go to Unclassified. Each group has a header with its name and count. Empty groups SHALL be hidden. Combined, every album SHALL stay in one sequence.

#### Scenario: Grouping a list
- **WHEN** an owner groups a list holding a studio album, a live EP, a single and a compilation by release type
- **THEN** the list shows Album, Live, Compilation and Unclassified in that order, with the live EP under Live and the single under Unclassified

#### Scenario: Collapsing a group
- **WHEN** an owner collapses the Live group
- **THEN** its albums are hidden, its header stays with its count, and it is still collapsed after a reload in the same tab

### Requirement: Grouping and sorting are independent
Switching the grouping SHALL never change the sort, and switching the sort SHALL never change the grouping (FR-05.8, AC-15). When grouped, the selected order SHALL apply within each group. Manual order SHALL be the same arrangement combined and grouped.

#### Scenario: Sort kept when grouping
- **WHEN** an owner sorts a list by Name, descending, then groups it by release type
- **THEN** the sort is still Name, descending, and each group's albums are in that order

#### Scenario: Manual order within groups
- **WHEN** an owner groups a list in manual order
- **THEN** each group's albums keep the order they have in the combined view

### Requirement: View options set a view's presentation
Every collection view SHALL have a View button, also opened with `V`, for its options (DS-49):
- the sort;
- the direction, disabled for manual order;
- for lists and Unsorted, the grouping and the layout.

"Use account defaults" SHALL clear the view's remembered choices, and "Save as my default" SHALL make its choices the account defaults. Choosing options SHALL work offline.

#### Scenario: Opening with V
- **WHEN** an owner presses V in a list
- **THEN** the list's View options open, with its current sort, direction, grouping and layout chosen

#### Scenario: Direction for manual order
- **WHEN** an owner chooses Manual in View options
- **THEN** the direction can't be changed

### Requirement: Each view remembers a person's choices
Each choice a person makes in a view SHALL be remembered for that view: the sort with its direction, the grouping and the layout (FR-05.2, FR-11.7). A choice not made SHALL follow the person's account defaults. Remembered choices SHALL be saved to the account and reach the person's other sessions (FR-11.8, FR-09.2, AC-16).

#### Scenario: Remembered and synced
- **WHEN** an owner sorts a list by Name in one browser
- **THEN** the list is sorted by Name in their other signed-in browser, without reloading, and other lists keep their order

#### Scenario: Back to the defaults
- **WHEN** an owner chooses "Use account defaults" for a list sorted by Name
- **THEN** the list follows the account defaults again

### Requirement: Account defaults apply where no choice was made
Signed-in people SHALL have account defaults: the sort and direction for lists and Unsorted, the sort and direction for folders and the root, the grouping and the layout (FR-11.7, DS-94). Until changed, they are Year ascending, combined and Rows for lists and Unsorted, and Manual for folders and the root (DS-44, FR-05.10). Changing a default SHALL never change a remembered choice.

#### Scenario: A default for unvisited views
- **WHEN** an owner sets the default sort for lists to Name in Settings → Preferences
- **THEN** a list they never changed is sorted by Name, and a list they sorted by Year stays sorted by Year

#### Scenario: Saving a view's choices as the default
- **WHEN** an owner groups Unsorted by release type and chooses "Save as my default"
- **THEN** lists without a remembered grouping are grouped by release type too
