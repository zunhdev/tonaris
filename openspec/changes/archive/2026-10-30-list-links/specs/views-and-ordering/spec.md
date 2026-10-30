# Spec Delta

## MODIFIED Requirements

### Requirement: Lists and Unsorted can show their albums as a grid
Lists and Unsorted SHALL offer a grid of album cards as well as rows (DS-22, DS-40). Each card shows the artwork, title, artist and year, the services the album has links for, and its save state. The layout SHALL be chosen in View options and remembered with the view's other choices (FR-11.8). Folders and the root SHALL always show rows.

#### Scenario: Switching to the grid
- **WHEN** an owner chooses Grid in a list's View options and reloads the page
- **THEN** the list shows its albums as cards, and Unsorted still shows rows

#### Scenario: A layout kept on the device
- **WHEN** an owner had chosen Grid for a list on this device before layouts were saved to the account, and opens the workspace
- **THEN** the list shows cards, and the choice is saved to the account

#### Scenario: A card's links
- **WHEN** an album in a list's grid has Spotify and Apple Music links
- **THEN** its card reads "Spotify · Apple Music" under the year
