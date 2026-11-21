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

### Requirement: Help's search finds a page by the reader's words
Help's search SHALL search every section of every page (FR-16.4, TS-136). Any form of a word SHALL find the others, accents and capitals aside; little words SHALL not count, so a whole question works; and everyday or other apps' words SHALL find Tonaris's, which the answer names. A word Help never uses SHALL be read as the one a letter away, saying so, and a word two letters away SHALL only be offered.

#### Scenario: Another app's word
- **WHEN** someone searches "playlist"
- **THEN** Folders and lists is among the first three results, under "Also looked for: list."

#### Scenario: A typo
- **WHEN** someone searches "spotfy link"
- **THEN** the results say "Showing results for “spotify link”." and include Add albums by pasting links

#### Scenario: Two letters off
- **WHEN** someone searches "vynil"
- **THEN** nothing matches, and "vinyl" is offered as "Did you mean"

### Requirement: Search opens over any Help page
Help's header SHALL open search from every page, as SHALL the search field on Help's home, ⌘K and / (FR-16.4, DS-122). Empty, it SHALL offer the pages people look for most and the reader's recent searches. Results SHALL come grouped by page, best first, each section with its heading and a snippet with the matching words marked; ↑ and ↓ SHALL move between them and Enter SHALL open one. On a phone, search SHALL fill the screen, with Cancel.

#### Scenario: From the keyboard
- **WHEN** someone presses ⌘K on a Help page and types "recycle bin"
- **THEN** Get something back from Trash comes first, and Enter opens it

#### Scenario: On a phone
- **WHEN** someone taps the header's search icon on a phone
- **THEN** search fills the screen, and Cancel closes it

### Requirement: A result opens at its answer
A result SHALL open its page at its section, with the words searched for marked in the page's text, or Tonaris's words for them when the reader's don't appear (FR-16.4, DS-122).

#### Scenario: Arriving
- **WHEN** someone opens a search result for "recycle bin"
- **THEN** its page opens at the section, with words marked

### Requirement: A search has a page of its own
`/help/search?q=` SHALL show every section found for the search, rendered on the server, with the same notes as the palette (FR-16.4, DS-122); finding nothing, it SHALL say so and offer other ways to an answer. Search engines SHALL not index it.

#### Scenario: A shared search
- **WHEN** `/help/search?q=export` is requested from the web server
- **THEN** the HTML already reads how many results there are for “export”, and lists Export your collection

### Requirement: Search is measured by searches people type
A test SHALL hold searches people type, with typos, other apps' words and whole questions, each with the page it must find first or among the first three, so a change that makes one worse fails (FR-16.4, TS-136).

#### Scenario: A change that loses a page
- **WHEN** a page's keywords change so that "recycle bin" no longer finds Get something back from Trash first
- **THEN** the search test fails
