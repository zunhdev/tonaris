# Spec Delta

## ADDED Requirements

### Requirement: The album panel slides in and out
The album panel SHALL slide in from the right over 200 ms with DS-17's enter easing, and out with its exit easing; a phone's album sheet SHALL slide up and down (DS-17, TON-159). The view SHALL narrow or widen at once. Reduced motion SHALL fade it instead. Back, Forward, and a panel open as the page loads, SHALL show it at once.

#### Scenario: Opening and closing
- **WHEN** an owner clicks an album, then presses Esc
- **THEN** the panel slides in from the right, then slides out over the widened view, and is gone

#### Scenario: Reduced motion
- **WHEN** an owner who prefers reduced motion opens an album
- **THEN** the panel fades in, without moving

#### Scenario: Reloaded with an album open
- **WHEN** an owner reloads a list with an album open
- **THEN** the panel shows without sliding

### Requirement: Loaded artwork shows at once
Artwork the browser already has, such as a row's or card's shown again in the inspector, SHALL show at once, without DS-23's 150 ms fade; artwork still loading SHALL fade in as before (FR-03.4, TON-159).

#### Scenario: A card's artwork in the inspector
- **WHEN** an owner opens an album whose card shows its artwork
- **THEN** the inspector shows the artwork at full opacity, without fading it in
