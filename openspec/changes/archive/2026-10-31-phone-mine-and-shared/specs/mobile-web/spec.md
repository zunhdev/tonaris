# Spec Delta

## MODIFIED Requirements

### Requirement: A phone browses the workspace by drilling down
Below 768 px wide, the workspace SHALL show no sidebar. Each view's top bar SHALL hold Back to the view above (none at the top), the view's name, its own controls, Search and Account (DS-110). The root screen SHALL switch between the person's own folders and lists, with Unsorted below them, and the folders and lists shared with them (TON-134).

#### Scenario: Down and back up
- **WHEN** a person on a phone opens a folder, then a list inside it, then presses Back twice
- **THEN** they return to the folder, then to Collection

#### Scenario: Mine and Shared
- **WHEN** a person on a phone switches Collection to Shared and opens a list Anna shared
- **THEN** Back returns them to Collection, still on Shared
