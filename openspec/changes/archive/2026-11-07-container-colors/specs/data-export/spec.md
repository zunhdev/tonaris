# Spec Delta

## MODIFIED Requirements

### Requirement: The export holds every album once
The export builder SHALL produce `tonaris-export.json` version 1.2 with its creation time (FR-08.3, FR-08.5, TS-81). It SHALL include every album the owner saved, active, in Unsorted or in Trash, exactly once, with its metadata, service links, identifiers, provenance and custom-field values.

#### Scenario: An album in two lists
- **WHEN** an album is in two lists and an owner exports
- **THEN** the album appears once in `albums`, and both lists' `albumIds` reference it
