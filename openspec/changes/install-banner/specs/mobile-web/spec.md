## ADDED Requirements

### Requirement: An iPhone or iPad suggests adding Tonaris to the Home Screen
On an iPhone or iPad, outside the installed app, the landing page and the workspace SHALL show a banner suggesting Tonaris be installed, with Install, which shows the steps to Add to Home Screen, and × (section 2.2, DS-123, TON-323). × SHALL close it for good on that device. While it shows, the page SHALL end above it. Android and computers SHALL show none.

#### Scenario: Install from the landing page
- **WHEN** a person opens the landing page in Safari on an iPhone and taps Install
- **THEN** a sheet shows the steps: Share, Add to Home Screen, then Add

#### Scenario: Closed for good
- **WHEN** a person closes the banner with × and opens Tonaris again on that iPhone
- **THEN** no banner shows

#### Scenario: The installed app
- **WHEN** a person opens Tonaris from its Home Screen icon
- **THEN** no banner shows

### Requirement: An app's built-in browser is sent to Safari
In an app's built-in browser on an iPhone or iPad, which can't add to the Home Screen, Install SHALL say to open Tonaris in Safari and offer Copy link, which copies the page's address, or shows it to copy by hand when the browser won't (section 2.2, DS-123, TON-323).

#### Scenario: A link opened in Threads
- **WHEN** a person opens a Tonaris link in Threads' browser on an iPhone, taps Install, then Copy link
- **THEN** the sheet says to open Tonaris in Safari, and the address is copied
