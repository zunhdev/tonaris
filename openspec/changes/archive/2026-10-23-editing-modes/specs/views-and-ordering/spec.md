# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
