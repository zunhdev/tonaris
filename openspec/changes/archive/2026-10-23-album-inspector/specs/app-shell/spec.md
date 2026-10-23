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
The workspace SHALL offer DS-78's shortcuts:
- G then H, U, T or S: the root, Unsorted, Trash, Settings → Preferences;
- `[`: hide or show the sidebar;
- `V`: View options;
- `M`: move the focused folder or list;
- `E`: Viewing or Editing mode;
- `L`: add the open or focused album to a list;
- `Esc`: close the album inspector;
- `?`: the reference of working shortcuts, also in the account menu.

Shortcuts SHALL be off while a text field has focus.

#### Scenario: Going to Unsorted
- **WHEN** an owner presses G then U
- **THEN** Unsorted opens

#### Scenario: Going to Settings
- **WHEN** an owner presses G then S
- **THEN** Settings → Preferences opens

#### Scenario: Shortcuts wait while typing
- **WHEN** an owner types "g u" into a name field
- **THEN** the text is typed and nothing else happens
