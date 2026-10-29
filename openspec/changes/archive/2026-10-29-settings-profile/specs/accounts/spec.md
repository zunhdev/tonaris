# Spec Delta

## ADDED Requirements

### Requirement: The display name in Settings → Profile
Settings → Profile SHALL show the display name and save a change when the field loses focus or on Enter (FR-11.3, DS-93). The name SHALL be optional: clearing it SHALL remove it while the person shares nothing. While they share, clearing SHALL be refused with an inline explanation, and the saved name SHALL stay (AC-38). The account menu SHALL show the name after a change, or the email once it is cleared.

#### Scenario: Setting a name
- **WHEN** someone types "Mira" in Display name and leaves the field
- **THEN** it is saved, the account menu reads "Mira", and the field still shows it after a reload

#### Scenario: Clearing while sharing nothing
- **WHEN** someone who shares nothing clears the field and leaves it
- **THEN** the name is removed, and the account menu shows their email

#### Scenario: Clearing while sharing
- **WHEN** someone with a link on clears the field and leaves it
- **THEN** the page says "People you share with see your display name. Stop sharing to clear it.", the field shows the saved name again, and the name is kept
