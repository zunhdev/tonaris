# app-shell Specification

## Purpose

The frame of the Tonaris web app: the desktop workspace layout, the route map, and which routes are rendered on the server or only in the browser (DS-30–DS-32; TS-03).

## Requirements

### Requirement: Three-pane desktop shell
Signed-in workspace pages SHALL use the three-pane layout of DS-30:
- a sidebar, 240px wide by default, resizable and hideable;
- a flexible main view;
- an inspector that takes no space until an item is opened.

Each pane is a labelled landmark, so screen-reader users can move between them (Q-02).

#### Scenario: The workspace opens in the shell
- **WHEN** a signed-in person opens the collection root `/c` on a desktop-width screen
- **THEN** the sidebar and the main view are shown side by side, the sidebar shows the Tonaris wordmark, and no inspector takes up space

#### Scenario: Panes are landmarks
- **WHEN** a screen reader lists the landmarks of a signed-in workspace page
- **THEN** it finds the sidebar navigation and the main content, each with an accessible name

### Requirement: Workspace routes render only in the browser
Signed-in workspace routes (DS-32: `/c`, `/f/…`, `/l/…`, `/unsorted`, `/trash`, `/shared`, `/invitations`, `/settings/…`, `/admin/…`) SHALL NOT be rendered on the server (TS-03): the server sends the document shell and the browser renders the page, so the collection loads once per session from the client store rather than twice.

#### Scenario: The server sends no workspace content
- **WHEN** `/c` is requested from the web server
- **THEN** the HTML response contains the document shell but not the workspace's content, and the page renders after the client scripts run

### Requirement: Public pages render on the server
Pages that don't need a loaded workspace (TS-03: sign-in, admission and approval landings, guest shares, help) SHALL be rendered on the server, so their first paint and link previews don't wait for client scripts.

#### Scenario: Sign-in arrives rendered
- **WHEN** `/sign-in` is requested from the web server
- **THEN** the HTML response already contains the page's heading and content

### Requirement: The root path opens the collection
`/` SHALL lead to the collection view last visited on this device, or to the collection root `/c` when there is none (DS-32).

#### Scenario: Visiting the root
- **WHEN** a person opens `/` on a device where they haven't visited a collection view
- **THEN** they land on `/c`

#### Scenario: Back where they were
- **WHEN** an owner opens the list 'Doom', then later opens `/` on the same device
- **THEN** they land on the list 'Doom'

### Requirement: Workspace routes require a session
Every workspace route SHALL require a signed-in session (FR-11.1). A signed-out visit SHALL go to `/sign-in`, carrying the requested path. After signing in, the person SHALL land on that path. Only paths within the web app SHALL be used as destinations.

#### Scenario: A signed-out visit asks for sign-in
- **WHEN** a signed-out person opens `/c`
- **THEN** they land on `/sign-in`, and after signing in they are back on `/c`

#### Scenario: Destinations stay in the app
- **WHEN** the sign-in destination is an absolute URL or a protocol-relative path such as `//evil.example`
- **THEN** sign-in ignores it and lands on the collection instead

### Requirement: The sidebar shows the collection as a tree
The sidebar SHALL show the owner's folders and lists as a tree, nested as saved, in creation order until a manual order exists (FR-01.3, DS-27, DS-31, DS-44). Below them it SHALL show Unsorted, Shared with me and Trash. Lists and Unsorted SHALL show their album counts. The current view's item SHALL be selected, and its ancestors expanded. Expanded folders SHALL be remembered on the device. Changes from any session SHALL appear without reloading.

#### Scenario: Nested folders and lists
- **WHEN** an owner has a folder 'Metal' holding a list 'Doom' with two albums, and opens 'Doom'
- **THEN** the tree shows 'Metal' expanded with 'Doom' inside it, selected, with the count 2

#### Scenario: Expansion is remembered
- **WHEN** an owner expands a folder and reloads the page
- **THEN** the folder is still expanded

### Requirement: The tree can be navigated by keyboard alone
The tree SHALL follow the ARIA tree pattern with a single tab stop (DS-27, Q-02). ↑ and ↓ SHALL move between visible items, and Home and End to the first and last. → SHALL expand a folder or move to its first child, and ← collapse it or move to the parent. Enter SHALL open the item. Typing letters SHALL move to the next item whose name starts with them, ignoring case and accents. A letter that is a shortcut SHALL act as the shortcut instead (decided 22 October 2026).

#### Scenario: Walking the tree
- **WHEN** an owner tabs into the tree, presses ↓ to 'Metal', → to expand it, ↓ to 'Doom' and Enter
- **THEN** the list 'Doom' opens

#### Scenario: Type-ahead
- **WHEN** an owner types "do" in the tree
- **THEN** focus moves to the next item named starting with "do", such as 'Doom'

#### Scenario: Shortcuts come first
- **WHEN** an owner presses N with the folder 'Metal' focused in the tree
- **THEN** a new list starts inside 'Metal', rather than focus moving to a name starting with "n"

### Requirement: Collection views have their own routes
Collection views SHALL use DS-32's paths (TS-03):
- `/c` for the root;
- `/f/{folderId}` and `/l/{listId}` for folders and lists;
- `/unsorted`, `/trash` and `/shared`.

A folder path naming a list SHALL lead to the list's path, and the other way round. A folder or list that doesn't exist or isn't the person's SHALL show that it isn't available, with a way back to the collection.

#### Scenario: A list opened by a folder path
- **WHEN** an owner opens `/f/{id}` where `{id}` is one of their lists
- **THEN** they land on `/l/{id}`

#### Scenario: A missing folder
- **WHEN** an owner opens `/f/{id}` for an ID with no folder of theirs
- **THEN** the view says the folder or list isn't available and links to the collection

### Requirement: Every view shows where it is
Each collection view SHALL show its path from Collection as breadcrumbs, each ancestor a link, and its own name as the page heading and in the page title (FR-01.3, DS-29, DS-30). The root SHALL show "Collection" alone. Below its header, each view SHALL show its contents, or its empty state when it holds nothing (DS-105).

#### Scenario: Breadcrumbs for a nested list
- **WHEN** an owner opens the list 'Doom' inside 'Metal'
- **THEN** the header shows Collection › Metal as links, the heading 'Doom', and the page title "Doom · Tonaris"

#### Scenario: An empty collection
- **WHEN** an owner with no folders, lists or albums opens `/c`
- **THEN** the view says "Start your collection — paste an album link or create a list." and offers New list

### Requirement: Keyboard shortcuts move around the workspace
The workspace SHALL offer DS-78's navigation shortcuts:
- G then H, U, T or S for the root, Unsorted, Trash or Settings;
- `[` to hide or show the sidebar;
- `?` for a reference of the shortcuts that work.

Shortcuts SHALL be off while a text field has focus. The reference SHALL also open from the account menu.

#### Scenario: Going to Unsorted
- **WHEN** an owner presses G then U
- **THEN** Unsorted opens

#### Scenario: Shortcuts wait while typing
- **WHEN** an owner types "g u" into a name field
- **THEN** the text is typed and nothing else happens

### Requirement: The sidebar can be resized and hidden
The sidebar SHALL be resizable between 200 and 360 px, by dragging its edge or with the arrow keys on it, and hideable with `[` or a button (DS-30). Its width and whether it is hidden SHALL be remembered on the device.

#### Scenario: Resizing by keyboard
- **WHEN** an owner focuses the sidebar's edge and presses → until it stops
- **THEN** the sidebar is 360 px wide, also after a reload
