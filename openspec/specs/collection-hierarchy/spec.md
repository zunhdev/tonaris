# collection-hierarchy Specification

## Purpose
The owner's folders and lists, and the rules that keep their tree sound: nesting, unique sibling names, renaming, and moves that reuse the hierarchy rather than copying it, within documented limits (FR-01.1–FR-01.5).

## Requirements

### Requirement: Folders and lists nest like a filesystem
An owner SHALL create folders and lists at the collection root or inside any active folder they own, and nest folders within folders (FR-01.1). A list SHALL NOT contain folders or lists. Nesting SHALL reach 32 levels, the root's children being the first; that limit is documented (TS-18). A create sent again with the same container ID SHALL NOT make a second container (FR-13.5).

#### Scenario: Create at the root and inside folders
- **WHEN** an owner creates the folder "Jazz" at the root, the folder "Bebop" inside it, and the list "Favorites" inside "Bebop"
- **THEN** all three exist, each under its parent, and appear in the owner's data

#### Scenario: Lists hold no containers
- **WHEN** an owner creates a folder or list whose parent is a list
- **THEN** it is rejected as an invalid destination and nothing is created

#### Scenario: Nesting stops at 32 levels
- **WHEN** an owner creates a folder inside a folder that is already 32 levels deep
- **THEN** it is rejected as over the limit and nothing is created

#### Scenario: A retried create duplicates nothing
- **WHEN** a create is sent again with the same container ID and the same values
- **THEN** it succeeds without creating a second container; with different values it is a conflict and nothing changes

### Requirement: Sibling names are unique across folders and lists
Active folders and lists with the same parent, the root included, SHALL have unique names across both kinds (FR-01.2, X-06). Names SHALL compare case-insensitively and keep their spelling for display, with surrounding whitespace removed. Blank names, and names over 200 characters, SHALL be rejected. The same name SHALL be allowed under different parents. Containers in Trash SHALL NOT reserve names.

#### Scenario: A list and a folder can't share a name under one parent
- **WHEN** the root holds the folder "Jazz" and the owner creates a list named "jazz" at the root
- **THEN** it is rejected as a name conflict and nothing is created

#### Scenario: The same name under different parents
- **WHEN** the owner creates a list "Favorites" in the folder "Jazz" and another "Favorites" in the folder "Rock"
- **THEN** both are created

#### Scenario: Blank or overlong names are invalid
- **WHEN** an owner creates or renames a container to a name that is empty, only whitespace, or longer than 200 characters
- **THEN** it is rejected as invalid and nothing changes

#### Scenario: Names keep their spelling
- **WHEN** an owner creates a list named "  Late Night Jazz "
- **THEN** it is saved as "Late Night Jazz"

### Requirement: Owners rename folders and lists
An owner SHALL rename their active folders and lists (FR-01.3). A rename SHALL follow the sibling-name rules, and a case-only rename of the same container SHALL be allowed. A rename made from a name that has since changed SHALL be a conflict and change nothing (FR-09.4).

#### Scenario: Rename a list
- **WHEN** an owner renames the list "Favorites" to "Desert island"
- **THEN** the list keeps its identity and contents and shows the new name everywhere

#### Scenario: A case-only rename is allowed
- **WHEN** an owner renames the folder "jazz" to "Jazz"
- **THEN** the folder is saved as "Jazz"

#### Scenario: A rename into a sibling's name is rejected
- **WHEN** a folder holds the lists "Favorites" and "Later", and the owner renames "Later" to "FAVORITES"
- **THEN** it is rejected as a name conflict and both lists keep their names

#### Scenario: A stale rename is a conflict
- **WHEN** another session renamed a list after this session last saw it, and this session renames it from the old name
- **THEN** the rename is a conflict reporting the current name, and nothing changes

### Requirement: Folder moves take the whole hierarchy
An owner SHALL move a folder to the root or to another active folder they own, taking all its descendant folders and lists, and their contents, with it unchanged and uncopied (FR-01.4). Moving a folder into itself or one of its descendants SHALL be rejected as a cycle. A destination that is a list, in Trash, not the owner's or missing SHALL be rejected as invalid. A move that would nest any descendant deeper than 32 levels SHALL be rejected as over the limit.

#### Scenario: A folder moves with everything under it
- **WHEN** an owner moves the folder "Bebop", holding a folder and two lists, from "Jazz" to the root
- **THEN** "Bebop" is at the root with the same identity, and its folder and lists are still under it with the same identities

#### Scenario: A folder can't move into its own subtree
- **WHEN** an owner moves the folder "Jazz" into "Bebop", which is inside "Jazz"
- **THEN** it is rejected as a cycle and nothing moves

#### Scenario: Invalid destinations are rejected
- **WHEN** an owner moves a folder into a list, into another person's folder, or into a folder that doesn't exist
- **THEN** it is rejected as an invalid destination and nothing moves

#### Scenario: A move can't nest too deep
- **WHEN** an owner moves a folder holding 3 levels of folders into a folder 30 levels deep
- **THEN** it is rejected as over the limit and nothing moves

### Requirement: List moves keep the list
An owner SHALL move a list between the root and their active folders (FR-01.5). The list SHALL keep its identity and everything attached to it; nothing is copied. The destination SHALL follow the same rules as a folder move, and the list's name SHALL be unique among its new siblings. A move made from a parent that has since changed SHALL be a conflict and change nothing.

#### Scenario: A list moves to another folder
- **WHEN** an owner moves the list "Favorites" from the folder "Jazz" to the folder "Rock"
- **THEN** "Favorites" is in "Rock" with the same identity

#### Scenario: A move into a sibling's name is rejected
- **WHEN** the folder "Rock" already holds a list named "Favorites" and the owner moves another "Favorites" into it
- **THEN** it is rejected as a name conflict and nothing moves

#### Scenario: A stale move is a conflict
- **WHEN** another session moved a list after this session last saw it, and this session moves it from its old parent
- **THEN** the move is a conflict reporting the current parent, and nothing moves

### Requirement: Rejected hierarchy changes change nothing
A rejected create, rename or move SHALL leave saved state unchanged and report its reason as a name conflict, a cycle, an invalid destination, a limit, invalid input, a container in Trash, a conflict or missing permission (X-05, FR-13). A rejection SHALL never rename, merge or replace an existing container.

#### Scenario: Containers in Trash can't be changed
- **WHEN** an owner renames or moves a folder that is in Trash
- **THEN** it is rejected because the folder is in Trash, and nothing changes

#### Scenario: Only the owner changes their containers
- **WHEN** a person renames or moves a folder in another person's collection
- **THEN** it is rejected as not permitted, and nothing changes

### Requirement: Folders and lists are limited to 2,000
An account SHALL hold at most 2,000 folders and lists, counting those in Trash until they are permanently removed (FR-15.4, TS-18). At the limit, only a new folder or list SHALL be rejected, with a clear reason; existing ones SHALL stay fully usable.

#### Scenario: Creating past the limit
- **WHEN** an account holds 2,000 folders and lists, some of them in Trash, and the owner creates another
- **THEN** it is rejected as over the limit, and renaming or moving existing ones still works

### Requirement: Hierarchy changes reach every session of the owner
Each created, renamed or moved folder or list SHALL reach the owner's other open sessions through their change stream, and be in the data a new session loads (FR-09.1, TS-23, TS-24).

#### Scenario: Another session sees a new list
- **WHEN** an owner creates a list in one session while another session of theirs is open
- **THEN** the other session shows the list without reloading

### Requirement: Owners create and rename folders and lists in the sidebar
An owner SHALL create a list (N) or folder (⇧N) inside the focused folder or the current view's folder, beside the focused or viewed list, or at the root (FR-01.1, DS-78). The "+" menu beside Collection SHALL create them at the root, whatever is focused or on view (TON-120). F2 SHALL rename the focused one (FR-01.3). Both edit the name inline. A blank, overlong or sibling-taken name SHALL keep the editor open with its reason (DS-107), sending nothing (X-05). While offline both SHALL be disabled (DS-81).

#### Scenario: Creating a folder and a list in it by keyboard
- **WHEN** an owner presses ⇧N, types "Metal" and Enter, then with 'Metal' focused presses N, types "Doom" and Enter
- **THEN** the folder 'Metal' holds the new list 'Doom', both saved

#### Scenario: The "+" menu creates at the top level
- **WHEN** an owner viewing the list 'Doom' in the folder 'Metal' chooses New list in the "+" menu beside Collection and enters "Later"
- **THEN** 'Later' is created at the top level, not in 'Metal'

#### Scenario: Renaming by keyboard
- **WHEN** an owner focuses the list 'Doom', presses F2, types "Funeral doom" and Enter
- **THEN** the list is renamed, and its breadcrumbs and heading follow

#### Scenario: A taken name is caught before sending
- **WHEN** an owner creates a list at the root named like an existing list 'Later'
- **THEN** the editor stays open saying "'Later' already exists at the top level. Choose another name.", and nothing is sent

#### Scenario: Offline
- **WHEN** the workspace is offline
- **THEN** the "+" menu is disabled with "You're offline", and N, ⇧N and F2 do nothing

### Requirement: A failed create or rename can be edited
When the server rejects a folder or list's creation or renaming, its toast, its Activity entry and its batch report item SHALL offer Edit (DS-80, FR-13.2). Edit reopens the inline editor, with the name that was attempted. Saving it SHALL clear the failure.

#### Scenario: Editing a rejected name
- **WHEN** a new list's name turns out taken on the server, and the owner chooses Edit, changes the name and presses Enter
- **THEN** the list is saved under the new name, and the failure is no longer listed

### Requirement: Owners move folders and lists from the interface
An owner SHALL move a folder or list from the interface on desktop (FR-01.4, FR-01.5, DS-49):
- with `M`, "Move to…", which offers the root and their folders that can take it;
- by dragging it onto a folder in the sidebar tree, or onto Collection.

The moved folder or list SHALL keep its contents, and leave its place in its old parent's arrangement. The move SHALL be announced. While offline, moving SHALL wait (DS-81). A refused move SHALL be reported and change nothing.

#### Scenario: Moving with M
- **WHEN** an owner focuses the list 'Doom' at the root, presses M and chooses the folder 'Metal'
- **THEN** 'Doom' is inside 'Metal', with its albums

#### Scenario: Moving by dragging onto the tree
- **WHEN** an owner drags the folder 'Funeral' onto Collection in the sidebar
- **THEN** 'Funeral' is at the root, with everything in it

#### Scenario: The picker offers only valid places
- **WHEN** an owner opens "Move to…" for the folder 'Metal'
- **THEN** neither 'Metal', its descendants, nor its current parent is offered

### Requirement: Folders and lists have optional descriptions
A folder or list SHALL have an optional plain-text description, which its owner SHALL set, change and clear as an ordinary change (FR-03.5). It SHALL be trimmed, empty text SHALL clear it, and it SHALL be at most 2,000 characters. A change SHALL apply only if the description is still the one the client saw (TS-21). It SHALL reach the owner's other sessions live, and SHALL show under the folder's or list's header and, as its first line, in its row (DS-41).

#### Scenario: Written and shown
- **WHEN** the owner describes the list "Grunge" as "Seattle, 1988 to 1994"
- **THEN** the list's page shows it under its name, and its folder's row shows it after the name

#### Scenario: Too long
- **WHEN** the owner enters 2,001 characters
- **THEN** the description is refused with "Descriptions can be at most 2,000 characters.", and the text stays for correcting

### Requirement: Descriptions survive moves and Trash, and are never searched
A description SHALL stay with its folder or list through moves, Trash and recovery (FR-03.5). Search SHALL NOT match descriptions (FR-12.4).

#### Scenario: Moved
- **WHEN** a described list moves to another folder
- **THEN** it keeps its description

#### Scenario: Recovered
- **WHEN** a described list goes to Trash and is recovered
- **THEN** it has its description

#### Scenario: Not searched
- **WHEN** only a description contains "Nirvana", and the owner searches for "Nirvana"
- **THEN** nothing matches

### Requirement: Folders and lists have a menu in the sidebar
Each folder and list in the sidebar SHALL offer a menu with New list, New folder, Rename, Move to…, Share… and Delete…, opened from its ⋯ with the pointer or with Shift+F10 or the Menu key (FR-01.1, FR-01.3, FR-01.4, FR-01.11). New list and New folder SHALL create inside a folder, and beside a list, in its folder or at the root (TON-120). Each item SHALL run what its shortcut runs on that folder or list, and show the shortcut. While offline, the items SHALL be disabled with the reason (DS-81).

#### Scenario: Creating inside a folder
- **WHEN** an owner chooses New list in the folder 'Metal''s menu and enters "Sludge"
- **THEN** 'Metal' holds the new list 'Sludge'

#### Scenario: Creating beside a list
- **WHEN** an owner chooses New folder in the menu of the list 'Doom', in the folder 'Metal', and enters "Drone"
- **THEN** 'Metal' holds the new folder 'Drone', beside 'Doom'

#### Scenario: Renaming with the mouse
- **WHEN** an owner opens the ⋯ menu on the list 'Doom' and chooses Rename
- **THEN** the name's editor opens in place, as F2 opens it

#### Scenario: Deleting with the mouse
- **WHEN** an owner chooses Delete… in a list's menu
- **THEN** the list goes to Trash with Undo, as ⌫ does

#### Scenario: From the keyboard
- **WHEN** an owner presses Shift+F10 on a focused folder and then Escape
- **THEN** the folder's menu opens, then closes, and the focus is back on the folder

### Requirement: The view's header renames its folder or list
In Editing mode, the header of a folder or list SHALL offer Rename beside Delete, opening the name's editor in the sidebar (FR-01.3).

#### Scenario: Renaming from the header
- **WHEN** an owner in Editing mode chooses Rename in the list 'Doom''s header and enters "Drone doom"
- **THEN** the list is renamed, and its heading follows
