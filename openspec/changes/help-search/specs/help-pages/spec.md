# Spec Delta

## ADDED Requirements

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
Help's header SHALL open search from every page, as SHALL the search field on Help's home, ⌘K and / (DS-122). Empty, it SHALL offer the pages people look for most and the reader's recent searches. Results SHALL come grouped by page, best first, each section with its heading and a snippet with the matching words marked; ↑ and ↓ SHALL move between them and Enter SHALL open one. On a phone, search SHALL fill the screen, with Cancel.

#### Scenario: From the keyboard
- **WHEN** someone presses ⌘K on a Help page and types "recycle bin"
- **THEN** Get something back from Trash comes first, and Enter opens it

#### Scenario: On a phone
- **WHEN** someone taps the header's search icon on a phone
- **THEN** search fills the screen, and Cancel closes it

### Requirement: A result opens at its answer
A result SHALL open its page at its section, with the words searched for marked in the page's text, or Tonaris's words for them when the reader's don't appear (DS-122).

#### Scenario: Arriving
- **WHEN** someone opens a search result for "recycle bin"
- **THEN** its page opens at the section, with words marked

### Requirement: A search has a page of its own
`/help/search?q=` SHALL show every section found for the search, rendered on the server, with the same notes as the palette; finding nothing, it SHALL say so and offer other ways to an answer. Search engines SHALL not index it.

#### Scenario: A shared search
- **WHEN** `/help/search?q=export` is requested from the web server
- **THEN** the HTML already reads how many results there are for “export”, and lists Export your collection

### Requirement: Search is measured by searches people type
A test SHALL hold searches people type, with typos, other apps' words and whole questions, each with the page it must find first or among the first three, so a change that makes one worse fails.

#### Scenario: A change that loses a page
- **WHEN** a page's keywords change so that "recycle bin" no longer finds Get something back from Trash first
- **THEN** the search test fails
