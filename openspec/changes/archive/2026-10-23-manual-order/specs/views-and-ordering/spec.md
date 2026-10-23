# Spec Delta

## ADDED Requirements

### Requirement: People rearrange views in manual order
Under manual order, a person SHALL rearrange a view's items on desktop (FR-05.2, DS-49):
- ⌥↑ and ⌥↓ move the focused item by one;
- ⌥⇧↑ and ⌥⇧↓ move it to the top or bottom;
- a row's drag handle drops it between rows.

Each move SHALL be announced with the item's new position, saved to the person's account, and kept across reloads and sessions. Grouped, an item SHALL move among its group's items. Under another sort, trying SHALL offer to switch to manual order.

#### Scenario: Moving an album up
- **WHEN** an owner focuses the third album of a list in manual order and presses ⌥↑
- **THEN** it becomes the second, "Moved {title} to position 2 of 3" is announced, and the order is the same after a reload

#### Scenario: Dragging a row
- **WHEN** an owner drags the last album of a list in manual order by its handle onto the top of the first row
- **THEN** it becomes the first

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
