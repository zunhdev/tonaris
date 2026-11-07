# views-and-ordering Specification

## Purpose
How folders, lists and Unsorted present what they hold, and in which order: albums as rows or a grid of cards, sorted and grouped, folders and lists as rows, smooth at the collection's size, with each person's choices remembered and their account defaults (FR-05, FR-11.7, FR-11.8).

## Requirements

### Requirement: Lists and Unsorted show their albums as rows
A list SHALL show the albums it holds, and Unsorted the albums in no list, one row each (FR-05, FR-01.9, DS-21). A row shows the album's artwork, title, artist, year and release type, and its save state. The release type SHALL be hidden while the view is grouped by release type. Albums SHALL come in the view's sort order (FR-05.1).

#### Scenario: A list's albums
- **WHEN** an owner who hasn't changed any view option opens a list holding 'Nightfall' (1987) and 'Epicus Doomicus Metallicus' (1986)
- **THEN** the view shows 'Epicus Doomicus Metallicus' first, then 'Nightfall', each with its artist, year and type

#### Scenario: Unsorted
- **WHEN** an owner has an album in no list and opens Unsorted
- **THEN** the album is shown there, and not in any list's view

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
Lists and Unsorted SHALL show their albums combined or grouped by release type (FR-05.7, FR-05.9, DS-43). Groups come in one fixed sequence: Album, EP, Single, Live, Compilation, then Unclassified. Live SHALL take priority over the other types. Unknown types SHALL go to Unclassified. Each group has a header with its name and count. Empty groups SHALL be hidden. Combined, every album SHALL stay in one sequence.

#### Scenario: Grouping a list
- **WHEN** an owner groups a list holding a studio album, a live EP, a single and a compilation by release type
- **THEN** the list shows Album, Single, Live and Compilation in that order, with the live EP under Live and the single under Single

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
- for lists and Unsorted, the grouping;
- the layout.

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
Signed-in people SHALL have account defaults: the sort and direction for lists and Unsorted, the sort and direction for folders and the root, the grouping, and a layout for each (FR-11.7, DS-94). Until changed, they are Year ascending, combined and Rows for lists and Unsorted, and Manual and Grid for folders and the root (DS-44, FR-05.10, TON-174). Changing a default SHALL never change a remembered choice.

#### Scenario: A default for unvisited views
- **WHEN** an owner sets the default sort for lists to Name in Settings → Preferences
- **THEN** a list they never changed is sorted by Name, and a list they sorted by Year stays sorted by Year

#### Scenario: Saving a view's choices as the default
- **WHEN** an owner groups Unsorted by release type and chooses "Save as my default"
- **THEN** lists without a remembered grouping are grouped by release type too

### Requirement: People rearrange views in manual order
Under manual order, a person SHALL rearrange a view's items on desktop (FR-05.2, DS-49):
- ⌥↑ and ⌥↓ move the focused item by one;
- ⌥⇧↑ and ⌥⇧↓ move it to the top or bottom;
- in Editing mode, a row's drag handle drops it between rows (DS-45).

Each move SHALL be announced with the item's new position, saved to the person's account, and kept across reloads and sessions. Grouped, an item SHALL move among its group's items. Under another sort, trying SHALL offer to switch to manual order.

#### Scenario: Moving an album up
- **WHEN** an owner focuses the third album of a list in manual order and presses ⌥↑
- **THEN** it becomes the second, "Moved {title} to position 2 of 3" is announced, and the order is the same after a reload

#### Scenario: Dragging a row
- **WHEN** an owner in Editing mode drags the last album of a list in manual order by its handle onto the top of the first row
- **THEN** it becomes the first

#### Scenario: No handles while viewing
- **WHEN** an owner in Viewing mode opens a list in manual order
- **THEN** no row shows a drag handle, and ⌥↑ still rearranges

#### Scenario: Rearranging under another sort
- **WHEN** an owner presses ⌥↑ in a list sorted by name
- **THEN** nothing moves, and a hint offers to switch to manual order

### Requirement: New items take their DS-51 places
Each person's arrangement SHALL place new items as DS-51 says (FR-05.4, TS-16):
- an album entering Unsorted, new or leaving its last list, at the top;
- an album added to a list at the end, after the arranged ones;
- a folder or list created in a folder, or the root, at the end.

An item's place SHALL NOT be kept when it leaves a view, so it returns as new: a folder or list moved elsewhere follows the arranged items there.

#### Scenario: Unsorted is an inbox
- **WHEN** an owner has arranged Unsorted, and an album leaves its last list
- **THEN** the album is at the top of Unsorted

#### Scenario: A list as a ranking
- **WHEN** an owner has arranged a list, then adds an album to it
- **THEN** the album is at the end of the list

### Requirement: Arranging from two sessions follows the conflict rules
Moving different items of a view from two sessions SHALL apply both. Moving an item from a place another session has since changed SHALL be a conflict that keeps the saved arrangement (FR-09.4).

#### Scenario: Different items
- **WHEN** one session moves 'Nightfall' and another moves 'Ancient Dreams' in the same list
- **THEN** both moves apply

#### Scenario: The same item
- **WHEN** one session moves 'Nightfall' to the top, and another session, which hadn't seen that, moves it to the bottom
- **THEN** 'Nightfall' stays at the top, and the second move is a conflict for review

### Requirement: Rearranging is presentation only
Rearranging SHALL never create or remove list entries, move folders or lists, or change access (FR-05.2–FR-05.4, AC-17). It SHALL change only the person's arrangement of that view.

#### Scenario: Rearranging Unsorted
- **WHEN** an owner moves an album to the top of Unsorted
- **THEN** the album is in no more lists than before

#### Scenario: Rearranging the root
- **WHEN** an owner moves a folder to the top of the root
- **THEN** every folder and list keeps its parent, and the tree shows the new order

### Requirement: The desktop app has a Viewing and an Editing mode
The desktop app SHALL offer a Viewing mode, the default, and an Editing mode (FR-04.1, DS-45). Viewing SHALL show no drag handles and no inline editing. Editing SHALL show drag handles under manual order and inline album cells. The mode SHALL be the same in every view, kept on the device, and not synced. Below 768 px, the app SHALL offer browsing only, with no mode toggle.

#### Scenario: Viewing by default
- **WHEN** an owner opens the workspace on a new device
- **THEN** the views are in Viewing mode

#### Scenario: Kept on the device
- **WHEN** an owner switches to Editing and reloads the page
- **THEN** the views are still in Editing mode

### Requirement: The mode is always clear and switched in the header or with E
Every collection view's header SHALL show the mode as a `View | Edit` control, and Editing mode SHALL tint the header's bottom border (FR-04.2, DS-45). `E` SHALL switch the mode. Switching SHALL send nothing to the server.

#### Scenario: Switching with E
- **WHEN** an owner in Viewing mode presses E
- **THEN** Edit is chosen in the header, the header shows the Editing tint, and no write is sent

### Requirement: Starting an edit switches to Editing mode
Starting an edit in Viewing mode SHALL switch to Editing mode first, announcing "Editing mode on" (DS-45). Edits that start this way are creating a folder or list, renaming one, moving one with M or by dragging it onto the tree, and editing an album's title with F2.

#### Scenario: A new list while viewing
- **WHEN** an owner in Viewing mode presses N
- **THEN** the mode is Editing, "Editing mode on" is announced, and the new list's name editor opens

### Requirement: Leaving Editing mode never loses an edit
Leaving Editing mode with an inline editor open SHALL save a valid value before switching, and SHALL keep an invalid value's editor open with its error, staying in Editing mode until the value is fixed or discarded (FR-04.2, DS-45).

#### Scenario: A valid edit is saved
- **WHEN** an owner is renaming a list to an unused name and switches to View
- **THEN** the new name is saved and the mode is Viewing

#### Scenario: An invalid edit blocks leaving
- **WHEN** an owner has an album's title cleared in its inline editor and chooses View
- **THEN** the mode stays Editing, the editor stays open with "Give the album a title.", and nothing is sent

### Requirement: A mode never grants write access
The mode SHALL only change what the interface shows (FR-04.2). The server SHALL judge every write the same whatever the mode, and switching modes SHALL change no permission.

#### Scenario: Switching modes sends nothing
- **WHEN** an owner switches between Viewing and Editing several times
- **THEN** no request is sent to the server

### Requirement: A card shows the album open in the inspector
In a grid of album cards, the card of the album the inspector shows SHALL stand out: an accent ring around its cover, set a little apart from it, and its title on an accent highlight (FR-05, DS-22, TON-167). Every other card SHALL look as before, and opening another album SHALL move the mark to its card.

#### Scenario: Opening an album from its card
- **WHEN** an owner viewing a list as cards clicks the card of 'Houses of the Holy'
- **THEN** that card's cover has the accent ring and its title the accent highlight, and no other card has them

#### Scenario: Closing the inspector
- **WHEN** the owner then presses Esc
- **THEN** no card has the ring or the highlight

### Requirement: A card responds to a hovering pointer
On a device whose pointer can hover, pointing at an album card SHALL show a raised surface behind its cover and text (FR-05, DS-22, TON-167). A touch screen SHALL show none, even after a tap. The surface SHALL never take a click: the card's service links SHALL still open their service and not the inspector.

#### Scenario: Pointing at a card
- **WHEN** an owner points at an album's card
- **THEN** a raised surface shows behind the card, and goes when the pointer leaves

#### Scenario: A service link under the hover
- **WHEN** an owner points at a card and clicks its Tidal link
- **THEN** Tidal opens the album, and the inspector stays closed

#### Scenario: A tap on a phone
- **WHEN** a person on a phone, viewing a list as cards, taps a card's Spotify link
- **THEN** Spotify opens the album, and the card shows no raised surface

### Requirement: A card labels releases other than studio albums
An album card's cover SHALL carry a small label naming its release type when that type is EP, Single or Compilation, and "Live" when the album is live, joined as in "Compilation · Live" (FR-05.9, DS-22, TON-167). An album of type Album, or of unknown type, that isn't live SHALL have no label. Guest pages' grids SHALL show the same labels.

#### Scenario: A live compilation and a studio album
- **WHEN** a list viewed as cards holds the live compilation 'How the West Was Won' and the album 'Houses of the Holy'
- **THEN** the first card's cover reads "Compilation · Live", and the second has no label

#### Scenario: An EP on a guest page
- **WHEN** a guest views a shared list as a grid, holding the EP 'Feel Good Lost'
- **THEN** its cover reads "EP"

#### Scenario: On a phone
- **WHEN** a person on a phone views a list holding a live album as cards
- **THEN** its cover reads "Live", and the page is no wider than the screen

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
