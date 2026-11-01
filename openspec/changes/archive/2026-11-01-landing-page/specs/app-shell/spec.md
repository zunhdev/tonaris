# Spec Delta

## MODIFIED Requirements

### Requirement: Public pages render on the server
Pages that don't need a loaded workspace (TS-03: the landing page, sign-in, admission and approval landings, guest shares, help) SHALL be rendered on the server, so their first paint and link previews don't wait for client scripts.

#### Scenario: Sign-in arrives rendered
- **WHEN** `/sign-in` is requested from the web server
- **THEN** the HTML response already contains the page's heading and content

#### Scenario: The landing page arrives rendered
- **WHEN** `/welcome` is requested from the web server
- **THEN** the HTML response already contains the page's heading and sections

### Requirement: The root path opens the collection
For a signed-in person, `/` SHALL lead to the collection view last visited on this device, or to the collection root `/c` when there is none (DS-32). Signed out, it SHALL lead to the landing page.

#### Scenario: Visiting the root
- **WHEN** a person opens `/` on a device where they haven't visited a collection view
- **THEN** they land on `/c`

#### Scenario: Back where they were
- **WHEN** an owner opens the list 'Doom', then later opens `/` on the same device
- **THEN** they land on the list 'Doom'

### Requirement: Workspace routes require a session
Every workspace route SHALL require a signed-in session (FR-11.1). A signed-out visit SHALL go to `/sign-in`, carrying the requested path, except `/`, which leads to the landing page. After signing in, the person SHALL land on that path. Only paths within the web app SHALL be used as destinations.

#### Scenario: A signed-out visit asks for sign-in
- **WHEN** a signed-out person opens `/c`
- **THEN** they land on `/sign-in`, and after signing in they are back on `/c`

#### Scenario: Destinations stay in the app
- **WHEN** the sign-in destination is an absolute URL or a protocol-relative path such as `//evil.example`
- **THEN** sign-in ignores it and lands on the collection instead
