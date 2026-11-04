# Spec Delta

## ADDED Requirements

### Requirement: A new album's release type starts at Album
The manual entry form's release type SHALL start at Album, unless capture found the album's type, which it SHALL keep (FR-02.4, TON-161). Unknown SHALL stay a choice, saving no type. The starting type SHALL NOT count as entered data.

#### Scenario: Entering an album by hand
- **WHEN** an owner opens "Enter manually", enters 'Nightfall', Candlemass and 1987, and saves
- **THEN** 'Nightfall' is saved as an Album

#### Scenario: Choosing Unknown
- **WHEN** an owner chooses Unknown as the release type and saves
- **THEN** the album is saved without a release type

#### Scenario: Closing an untouched form
- **WHEN** an owner opens the form and presses Esc without entering anything
- **THEN** the form closes without asking
