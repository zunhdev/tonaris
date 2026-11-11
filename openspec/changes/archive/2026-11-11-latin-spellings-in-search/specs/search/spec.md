## ADDED Requirements

### Requirement: Names can be typed in plain Latin letters
Matching SHALL also accept common Latin spellings of letters (FR-12.5): ø as "o" or "oe", æ as "ae", ł as "l", þ as "th"; ä, ö, ü and å also as "ae", "oe", "ue" and "aa"; and Cyrillic and Greek letters by common transliterations. A query SHALL match when it spells part of a name in any of them, each letter in one spelling. A Latin letter SHALL match only itself. Chinese, Japanese and Korean SHALL match only as written.

#### Scenario: Cyrillic by Latin letters
- **WHEN** the owner searches "kino" and has the list "Кино"
- **THEN** "Кино" appears, highlighted whole

#### Scenario: A spelled-out umlaut
- **WHEN** the owner searches "aerzte" or "arzte"
- **THEN** the album by "Die Ärzte" appears

#### Scenario: Several spellings of a letter
- **WHEN** the owner searches "mumiy troll", "mumii troll" or "mumij"
- **THEN** the album by "Мумий Тролль" appears

#### Scenario: A Latin letter keeps its own spelling
- **WHEN** the owner searches "jes"
- **THEN** "Yes" doesn't appear

#### Scenario: The original alphabet still works
- **WHEN** the owner searches "Кино"
- **THEN** "Кино" appears

### Requirement: Latin spellings match everywhere search does, without reordering
The palette, server and MCP search, "Add to a list", "Find a folder", the Trash filter and the sidebar's type-ahead SHALL all match Latin spellings in the same way. Sorting in views, paths and the sidebar SHALL NOT change.

#### Scenario: Server and app agree
- **WHEN** an API client searches "kino"
- **THEN** the lists "Кино" and "Kinoband" come in the app's order

#### Scenario: Finding a list by its path
- **WHEN** the owner types "russkii zemf" in "Add to a list"
- **THEN** the list "Русский рок › … › Земфира" is offered

#### Scenario: Sort order unchanged
- **WHEN** a folder holds the lists "Кино" and "Kraftwerk", sorted by name
- **THEN** "Kraftwerk" comes before "Кино", as before
