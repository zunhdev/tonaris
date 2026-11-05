# Spec Delta

## MODIFIED Requirements

### Requirement: Lists and Unsorted can be grouped by release type
Lists and Unsorted SHALL show their albums combined or grouped by release type (FR-05.7, FR-05.9, DS-43). Groups come in one fixed sequence: Album, EP, Single, Live, Compilation, then Unclassified. Live SHALL take priority over the other types. Unknown types SHALL go to Unclassified. Each group has a header with its name and count. Empty groups SHALL be hidden. Combined, every album SHALL stay in one sequence.

#### Scenario: Grouping a list
- **WHEN** an owner groups a list holding a studio album, a live EP, a single and a compilation by release type
- **THEN** the list shows Album, Single, Live and Compilation in that order, with the live EP under Live and the single under Single

#### Scenario: Collapsing a group
- **WHEN** an owner collapses the Live group
- **THEN** its albums are hidden, its header stays with its count, and it is still collapsed after a reload in the same tab
