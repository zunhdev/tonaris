## ADDED Requirements

### Requirement: A person puts their streaming services in their own order
Each person SHALL be able to put the streaming services in their own order in Settings, by dragging a service or with ⌥↑ and ⌥↓, saved to their account and synced (FR-06.3, TON-282). Every list of an album's services and link fields SHALL follow it, and it SHALL never open a service by itself (FR-06.5). Until a person chooses, and for guests, the services keep their usual order.

#### Scenario: Tidal first
- **WHEN** a person drags Tidal to the top of their services in Settings, and opens the chooser for an album with Spotify and Tidal links
- **THEN** it offers "Open in Tidal", then "Open in Spotify"

#### Scenario: By keyboard
- **WHEN** the person focuses YouTube Music's switch and presses ⌥↑
- **THEN** YouTube Music moves a place up, and its switch keeps the focus

#### Scenario: On every device
- **WHEN** the person reloads Tonaris after reordering
- **THEN** the services, and the links on the album's row and card, keep that order
