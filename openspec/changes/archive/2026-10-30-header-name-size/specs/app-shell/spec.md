# Spec Delta

## MODIFIED Requirements

### Requirement: Every view shows where it is
Each collection view SHALL show its path from Collection as breadcrumbs, each ancestor a link, and its own name as the page heading and in the page title (FR-01.3, DS-29, DS-30). The root SHALL show "Collection" alone. Below its header, each view SHALL show its contents, or its empty state when it holds nothing (DS-105). On the desktop, the name SHALL be the breadcrumbs' size, set apart from them by weight and colour.

#### Scenario: Breadcrumbs for a nested list
- **WHEN** an owner opens the list 'Doom' inside 'Metal'
- **THEN** the header shows Collection › Metal as links, the heading 'Doom', and the page title "Doom · Tonaris"

#### Scenario: An empty collection
- **WHEN** an owner with no folders, lists or albums opens `/c`
- **THEN** the view says "Start your collection — paste an album link or create a list.", offers New list, and offers "Connect an AI assistant", which opens Settings → Connections

#### Scenario: The name beside the breadcrumbs
- **WHEN** an owner on the desktop opens the list 'Doom' inside 'Metal'
- **THEN** 'Doom' is 13 px like the breadcrumbs, in medium weight and the primary text colour
