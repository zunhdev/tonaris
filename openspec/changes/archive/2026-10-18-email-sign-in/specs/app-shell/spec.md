# Spec Delta

## MODIFIED Requirements

### Requirement: Three-pane desktop shell
Signed-in workspace pages SHALL use the three-pane layout of DS-30: a 240px sidebar, a flexible main view and an inspector that takes no space until an item is opened. Each pane is a labelled landmark, so screen-reader users can move between them (Q-02).

#### Scenario: The workspace opens in the shell
- **WHEN** a signed-in person opens the collection root `/c` on a desktop-width screen
- **THEN** the sidebar and the main view are shown side by side, the sidebar shows the Tonaris wordmark, and no inspector takes up space

#### Scenario: Panes are landmarks
- **WHEN** a screen reader lists the landmarks of a signed-in workspace page
- **THEN** it finds the sidebar navigation and the main content, each with an accessible name

## ADDED Requirements

### Requirement: Workspace routes require a session
Every workspace route SHALL require a signed-in session (FR-11.1). A signed-out visit SHALL go to `/sign-in`, carrying the requested path. After signing in, the person SHALL land on that path. Only paths within the web app SHALL be used as destinations.

#### Scenario: A signed-out visit asks for sign-in
- **WHEN** a signed-out person opens `/c`
- **THEN** they land on `/sign-in`, and after signing in they are back on `/c`

#### Scenario: Destinations stay in the app
- **WHEN** the sign-in destination is an absolute URL or a protocol-relative path such as `//evil.example`
- **THEN** sign-in ignores it and lands on the collection instead
