# Spec Delta

## ADDED Requirements

### Requirement: Add album buttons show their key
Each Add album button that opens the capture dialog SHALL show C, the key that opens it (DS-78), in its tooltip, and carry it in `aria-keyshortcuts` (TON-122). Offline, its tooltip SHALL keep the reason it waits (DS-81).

#### Scenario: Hovering Add album
- **WHEN** an owner hovers the sidebar's Add album
- **THEN** its tooltip reads "Add album" with the key C
