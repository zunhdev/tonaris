# app-shell Specification

## Purpose

The frame of the Tonaris web app: the desktop workspace layout, the route map, and which routes are rendered on the server or only in the browser (DS-30–DS-32; TS-03).

## Requirements

### Requirement: Three-pane desktop shell
Signed-in workspace pages SHALL use the three-pane layout of DS-30: a 240px sidebar, a flexible main view and an inspector that takes no space until an item is opened. Each pane is a labelled landmark, so screen-reader users can move between them (Q-02).

#### Scenario: The workspace opens in the shell
- **WHEN** a person opens the collection root `/c` on a desktop-width screen
- **THEN** the sidebar and the main view are shown side by side, the sidebar shows the Tonaris wordmark, and no inspector takes up space

#### Scenario: Panes are landmarks
- **WHEN** a screen reader lists the page's landmarks
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
`/` SHALL lead to a collection view (DS-32). Until the last visited view is remembered, it leads to the collection root `/c`.

#### Scenario: Visiting the root
- **WHEN** a person opens `/`
- **THEN** they land on `/c`
