# Spec Delta

## ADDED Requirements

### Requirement: Help is a link away before signing in
Under the sign-in card and on shared pages, Terms · Privacy · Help SHALL lead to Help's home (FR-16.5, DS-122).

#### Scenario: Stuck at sign-in
- **WHEN** a visitor on `/sign-in` chooses Help
- **THEN** Help's home opens

### Requirement: Help opens from inside the app in a new tab
The account menu, on a computer and a phone, SHALL offer Help; ⌘K SHALL offer Open help, and after a search's results "Search help for '…'", which opens Help's results for the same words; and the `?` sheet SHALL link to Help's Keyboard shortcuts (FR-16.5, DS-122). Each SHALL open in a new tab, so the workspace keeps its place.

#### Scenario: From ⌘K
- **WHEN** someone types "dark mode" in ⌘K and chooses "Search help for 'dark mode'"
- **THEN** `/help/search?q=dark%20mode` opens in a new tab, and the palette closes

### Requirement: "Learn more" goes where people hesitate
"Learn more" SHALL link to the Help section about what's in front of the reader, in a new tab, in the sharing dialog, the "Which album is this?" card, Custom fields, Connections, Export, Trash, Activity and an empty collection, and nowhere else (FR-16.5, DS-122). A screen reader SHALL hear what it's about.

#### Scenario: At Connections
- **WHEN** someone chooses Learn more under Connected clients
- **THEN** Connect Claude, ChatGPT or Codex opens at "Choose what the agent may do", in a new tab

## MODIFIED Requirements

### Requirement: Links between Help's pages can't break unnoticed
Building Help SHALL fail when a page links to a Help page or heading that doesn't exist, names a related page that doesn't exist, or shows a picture that isn't there (TS-136). The app's links into Help SHALL name their page and heading by type, so type-checking fails on one that doesn't exist (FR-16.5).

#### Scenario: A renamed page
- **WHEN** a page is renamed and another still links to its old address
- **THEN** generating the page list fails and names the page with the broken link

#### Scenario: A renamed heading the app links to
- **WHEN** a heading the app's Learn more names is renamed in Help
- **THEN** type-checking the app fails at that link
