# Spec Delta

## ADDED Requirements

### Requirement: Recovery refuses an expired unit
Recovering a unit at or past its expiry SHALL be refused as expired, even before the hourly purge removes it, in the app and through MCP alike (FR-01.17, X-02). Nothing SHALL come back.

#### Scenario: Minutes after expiry
- **WHEN** a person recovers a list whose 30 days ended before the purge ran
- **THEN** the recovery fails as expired, and the list stays in Trash until the purge removes it
