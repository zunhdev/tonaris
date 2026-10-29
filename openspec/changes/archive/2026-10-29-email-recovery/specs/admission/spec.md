# Spec Delta

## ADDED Requirements

### Requirement: Admin lists members without their collections
Admin → Members SHALL list every account with its email, display name and join date only (FR-11.6, DS-100). It SHALL never show or reach collection data. Like Admissions, it SHALL be the creator's alone, and in the app only.

#### Scenario: The member list
- **WHEN** the creator opens Admin → Members
- **THEN** each account shows its email, display name and join date, and nothing about its folders, lists or albums

#### Scenario: Another account
- **WHEN** an account without the creator role calls the member API or opens the page
- **THEN** the API answers `permission_denied` and the page is not found
