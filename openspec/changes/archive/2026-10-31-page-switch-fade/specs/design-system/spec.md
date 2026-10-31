# Spec Delta

## ADDED Requirements

### Requirement: Page switches fade in
When the workspace switches to another page, its content below the header SHALL fade in over 120 ms, opacity only, with DS-17's enter easing (TON-140), while the old page goes at once. The sidebar, the page header, the Settings and Admin tabs and the offline banner SHALL stay still. A change that keeps the path, such as opening an album, is not a switch. Back, forward and reduced motion SHALL switch at once.

#### Scenario: A list opens
- **WHEN** a list is opened from the sidebar
- **THEN** its content fades in below its header, while the header and the sidebar stay at full opacity

#### Scenario: Back shows the page at once
- **WHEN** the person goes back to the page before
- **THEN** it shows without a fade

#### Scenario: Reduced motion
- **WHEN** the browser asks for reduced motion
- **THEN** pages switch without a fade
