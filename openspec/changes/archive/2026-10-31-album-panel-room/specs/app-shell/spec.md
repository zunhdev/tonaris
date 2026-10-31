# Spec Delta

## ADDED Requirements

### Requirement: The album inspector can be resized
The album inspector SHALL be resizable between 320 and 560 px, by dragging its left edge or with the arrow keys, Home and End on it, 380 px at first (DS-30, TON-124). Its width SHALL be remembered on the device.

#### Scenario: Widening by keyboard
- **WHEN** an owner focuses the inspector's edge and presses End
- **THEN** the inspector is 560 px wide, also after a reload
