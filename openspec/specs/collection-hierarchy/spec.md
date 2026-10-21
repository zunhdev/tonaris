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
