# Spec Delta

## ADDED Requirements

### Requirement: The sign-in page sends someone already signed in on
A signed-in person who opens `/sign-in` SHALL be sent on, without the page staying in history: to the page they asked for, when it is inside the app, or else to `/` (DS-90, TON-185). A sign-in that continues an AI client's authorization SHALL keep the form.

#### Scenario: No destination
- **WHEN** a signed-in person opens `/sign-in`
- **THEN** their collection opens

#### Scenario: A destination
- **WHEN** a signed-in person opens `/sign-in?redirect=/unsorted`
- **THEN** Unsorted opens

#### Scenario: An AI client's sign-in
- **WHEN** a signed-in person reaches `/sign-in` on the way to `/oauth/authorize`
- **THEN** the email form stays
