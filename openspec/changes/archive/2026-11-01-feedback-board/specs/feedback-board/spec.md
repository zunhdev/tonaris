# Spec Delta

## ADDED Requirements

### Requirement: The account menu opens the feedback board
When Tonaris has a feedback board, the account menu SHALL offer **Feedback and ideas**, on desktop and phone. It SHALL open the board at `feedback.tonaris.app` in a new tab, through the board's sign-in for Tonaris, so a member signed in to Tonaris arrives signed in (FR-11.15, DS-31). Without a configured board, the item SHALL NOT show.

#### Scenario: Opening the board
- **WHEN** a member chooses **Feedback and ideas** in the account menu
- **THEN** the board's sign-in for Tonaris opens in a new tab, and the workspace stays where it was

#### Scenario: No board configured
- **WHEN** the web app has no board's address or callback URL
- **THEN** the account menu has no **Feedback and ideas**

### Requirement: Members sign in to the board with Tonaris
The board SHALL sign people in through Tonaris's authorization server as the first-party client `feedback-board`, without a consent page and without PKCE. A person signed out of Tonaris SHALL sign in first. The client SHALL exist only while the API has both `FEEDBACK_CALLBACK_URL` and `FEEDBACK_CLIENT_SECRET`, and the API SHALL refuse to start with only one (FR-11.15, TS-61).

#### Scenario: Signed in to Tonaris
- **WHEN** a signed-in member follows the board's sign-in
- **THEN** they go straight back to the board with a code, which the board exchanges with its secret

#### Scenario: Signed out
- **WHEN** someone signed out of Tonaris follows the board's sign-in
- **THEN** Tonaris's sign-in page opens, and the sign-in continues after it

#### Scenario: A wrong secret
- **WHEN** the board's code is exchanged with another secret
- **THEN** no token is issued

#### Scenario: The settings removed
- **WHEN** the API starts without the board's settings
- **THEN** the board's client is disabled and its sign-ins fail

### Requirement: The board receives the ID, name and email, and nothing else
The board's client SHALL be granted at most `openid` and `email`. Its userinfo SHALL carry the account ID, the email address, and the display name, or "Tonaris member" for a person without one, never a name made from the email (FR-11.15).

#### Scenario: Reading the profile
- **WHEN** the board reads userinfo with its token
- **THEN** it gets the account ID, the email, and the display name or "Tonaris member"

#### Scenario: Asking for more
- **WHEN** the board's authorization request asks for an MCP scope as well
- **THEN** it is refused with `invalid_scope`, and no code is issued

### Requirement: The board's tokens open nothing else
The board's tokens SHALL be refused by `/mcp` and by `/v1`. Signing in to the board SHALL record no grant, so it is not a connection in Settings (FR-10.3, FR-11.15).

#### Scenario: Using the board's token elsewhere
- **WHEN** the board's access token is sent to `/mcp` or `/v1/me`
- **THEN** it is refused with `401`

#### Scenario: Settings' connections
- **WHEN** a member who signed in to the board opens Settings → Connections
- **THEN** the board isn't listed

### Requirement: Only the board reads the person's profile
Registered and discovered clients SHALL get only MCP's scopes, and discovery SHALL advertise only those. Userinfo SHALL refuse every token but the board's (FR-10.1, TS-61).

#### Scenario: An AI client asks for identity scopes
- **WHEN** a registered client asks for `openid` or `email`
- **THEN** the authorization is refused with `invalid_scope`

#### Scenario: An MCP token at userinfo
- **WHEN** an MCP access token is sent to userinfo
- **THEN** it is refused, and no email is returned
