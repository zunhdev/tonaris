# Spec Delta

## MODIFIED Requirements

### Requirement: Collection views have their own routes
Collection views SHALL use DS-32's paths (TS-03):
- `/c` for the root;
- `/f/{folderId}` and `/l/{listId}` for folders and lists;
- `/unsorted`, `/trash` and `/shared`;
- `?album={albumId}` on a view for its open inspector, and `/a/{albumId}` for an album on its own page.

A folder path naming a list SHALL lead to the list's path, and the other way round. A folder, list or album that doesn't exist or isn't the person's SHALL show that it isn't available, with a way back to the collection.

#### Scenario: A list opened by a folder path
- **WHEN** an owner opens `/f/{id}` where `{id}` is one of their lists
- **THEN** they land on `/l/{id}`

#### Scenario: A missing folder
- **WHEN** an owner opens `/f/{id}` for an ID with no folder of theirs
- **THEN** the view says the folder or list isn't available and links to the collection

#### Scenario: An album's own page
- **WHEN** an owner opens `/a/{id}` for one of their albums
- **THEN** the page shows the album, as the inspector does

### Requirement: Keyboard shortcuts move around the workspace
The workspace SHALL offer DS-78's navigation shortcuts:
- G then H, U, T or S for the root, Unsorted, Trash or Settings → Preferences;
- `[` to hide or show the sidebar;
- `V` for the current view's View options;
- `M` to move the focused folder or list;
- `E` to switch between Viewing and Editing mode;
- `L` to add the open or focused album to a list;
- `Esc` to close the album inspector;
- `?` for a reference of the shortcuts that work.

Shortcuts SHALL be off while a text field has focus. The reference SHALL also open from the account menu.

#### Scenario: Going to Unsorted
- **WHEN** an owner presses G then U
- **THEN** Unsorted opens

#### Scenario: Going to Settings
- **WHEN** an owner presses G then S
- **THEN** Settings → Preferences opens

#### Scenario: Shortcuts wait while typing
- **WHEN** an owner types "g u" into a name field
- **THEN** the text is typed and nothing else happens
