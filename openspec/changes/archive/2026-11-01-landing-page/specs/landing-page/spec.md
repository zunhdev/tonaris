# Spec Delta

## ADDED Requirements

### Requirement: Signed-out visitors to the root path see the landing page
A visit to `/` without a session SHALL lead to the landing page, `/welcome` (DS-32, DS-120): the web server SHALL answer a request without a session cookie with a redirect there, and the browser SHALL send a signed-out `/` there too. A signed-in visit SHALL still open the last view.

#### Scenario: A first visit
- **WHEN** someone with no session opens `/`
- **THEN** they arrive at `/welcome`, and the response for it already contains the page's heading

#### Scenario: Signed in
- **WHEN** a signed-in person opens `/`
- **THEN** they land on their last collection view, or `/c`

### Requirement: The landing page says what Tonaris is
The landing page SHALL say what Tonaris does, walk through adding an album in four steps, and show what sets it apart: folders within folders and lists, AI agents through MCP with approvals, sharing, export, and speed, and that it works on a phone (DS-120). It SHALL say Tonaris is invitation-only and offer Sign in, which opens `/sign-in`.

#### Scenario: Reading the page
- **WHEN** a visitor opens `/welcome`
- **THEN** they find How it works, What sets it apart and On your phone, each with its heading, and Sign in leads to `/sign-in`

#### Scenario: On a phone
- **WHEN** a visitor opens `/welcome` on a phone
- **THEN** the page fits the screen's width, and axe finds nothing at either width

### Requirement: The landing page shows the app with invented albums
The landing page's pictures SHALL show the app as it looks, drawn from its own parts, with invented albums whose covers are drawn for them (DS-120). No real album's artwork or name SHALL appear. Each picture SHALL be one image with a text alternative.

#### Scenario: The workspace picture
- **WHEN** a screen reader reaches the picture under the hero
- **THEN** it hears one description of the workspace, not the text inside the picture

### Requirement: Pages for signed-out visitors lead to the landing page
On the sign-in steps, the admission landing, recovery help, account recovery, the account-deleted page and guest pages, the wordmark SHALL link to `/welcome` (DS-120). Pages for signed-in people in the same frame, such as approvals, SHALL keep it plain.

#### Scenario: From sign-in
- **WHEN** a visitor on `/sign-in` activates the wordmark
- **THEN** the landing page opens
