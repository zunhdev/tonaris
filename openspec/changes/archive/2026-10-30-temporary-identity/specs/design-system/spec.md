# Spec Delta

## ADDED Requirements

### Requirement: A temporary mark identifies Tonaris
The sidebar, guest pages and the sign-in page SHALL show the mark beside the name "Tonaris", and browsers SHALL get the mark as the favicon and the iOS home-screen icon (DS-19). The mark SHALL be defined once for the app and once as an SVG for the icons, so the permanent logo can replace it.

#### Scenario: A browser tab
- **WHEN** a page of Tonaris opens in a browser
- **THEN** its tab shows the mark, from the web app's own `favicon.svg`

#### Scenario: The sidebar
- **WHEN** an owner opens the workspace on the desktop
- **THEN** the sidebar's header shows the mark beside "Tonaris"
