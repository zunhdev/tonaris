# help-pages Specification

## Purpose
Help at `/help` (FR-16, DS-122, TS-136; P-TON-58): public pages that explain every workflow, organized by what people want to do, with their frame, their parts, their keys and their pictures, and the checks that keep links between them whole.

## Requirements

### Requirement: Help's pages are public and arrive rendered
Help's home at `/help` and each page at `/help/{section}/{page}` SHALL be public and rendered on the server with their content (FR-16.1, DS-122, TS-136), so they work before sign-in and for link previews. An address that isn't a page SHALL be answered 404, with a way back to Help's home.

#### Scenario: A page arrives whole
- **WHEN** `/help/start-here/your-first-ten-minutes` is requested from the web server
- **THEN** the HTML response already contains the page's title and its content

#### Scenario: Not a page
- **WHEN** someone opens `/help/start-here/no-such-page`
- **THEN** the response is a 404 that reads "This page isn't in Help", with a link to Help's home

### Requirement: Help is organized by what people want to do
Help's pages SHALL be grouped in sections named for goals, such as Start here, Add albums and Share, in a fixed order (FR-16.1, DS-122). Each page SHALL open with its section, its title and a one-sentence answer, say "Needs a computer" when its tasks need one, and close with related pages and the previous and next pages in reading order. Help's home SHALL offer the two pages for someone new and every section with its pages.

#### Scenario: Reading a page
- **WHEN** a visitor opens Your first ten minutes
- **THEN** they see Start here, the title, its answer and "Needs a computer", then the page, related pages, and Previous and Next

#### Scenario: The home
- **WHEN** a visitor opens `/help`
- **THEN** they see "Tonaris Help", "New here?" with What Tonaris is and Your first ten minutes, and a tile per section listing its pages

### Requirement: Help's contents follow the page on view
On a computer, Help's contents SHALL sit beside every page but the home, with the current section open and the current page marked; on a phone, a Contents button SHALL open them in a sheet that closes on a choice (DS-122). From 1280 px, a page with two or more sections SHALL show On this page, marking the section in view.

#### Scenario: On a phone
- **WHEN** a visitor on a phone chooses Contents, then a page
- **THEN** the sheet closes and the page opens, and nothing is wider than the screen

### Requirement: Steps name their keys as the reader's computer does
A step with a key SHALL name it beside the mouse action (FR-16.2). Keys SHALL show as the reader's computer labels them: ⌘, ⌥, ⇧ and ⌫ on Apple's, Ctrl, Alt, Shift and Backspace elsewhere. A screen reader SHALL hear each key's name.

#### Scenario: Off a Mac
- **WHEN** a visitor on Windows reads the step to paste a link
- **THEN** it shows Ctrl and V, read as "Control V"

### Requirement: Help works by keyboard alone
Help SHALL offer "Skip to content" first, and its contents SHALL move by keys as the app's tree does: ↑ and ↓ between rows, → to open a section, ← to close it or go up to it, Home and End (FR-16.2, DS-122). Focus SHALL always be visible.

#### Scenario: Through the contents
- **WHEN** a visitor focuses a section in the contents and presses ←, →, ↓ and Enter
- **THEN** the section closes, opens, the focus moves to its first page, and Enter opens it

### Requirement: Help's pictures show only invented albums
Help's pictures SHALL be taken from the app on a demo collection of invented albums, with covers drawn for them, and SHALL each have a text alternative (FR-16.3, TS-136). No real album's name or artwork SHALL appear.

#### Scenario: A picture
- **WHEN** a screen reader reaches the picture of the Add albums dialog
- **THEN** it hears what the picture shows

### Requirement: Links between Help's pages can't break unnoticed
Building Help SHALL fail when a page links to a Help page or heading that doesn't exist, names a related page that doesn't exist, or shows a picture that isn't there (TS-136). The app's links into Help SHALL use typed page names.

#### Scenario: A renamed page
- **WHEN** a page is renamed and another still links to its old address
- **THEN** generating the page list fails and names the page with the broken link
