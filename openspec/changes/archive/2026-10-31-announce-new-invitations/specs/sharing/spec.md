# Spec Delta

## ADDED Requirements

### Requirement: New invitations are announced in the open app
A new pending invitation SHALL be announced once on the recipient's device, in the open app, naming its owner and collection, with a way to open it (FR-07.5, TON-129). Several found together SHALL be announced as one, with a way to the inbox.

#### Scenario: Announced once
- **WHEN** Denis invites Anna to the list "Doom" while her app is open
- **THEN** within a minute it reads "Denis shared "Doom" with you" with View, and reloading doesn't announce it again
