# Spec Delta

## ADDED Requirements

### Requirement: A person chooses the services whose link fields they see
Each person SHALL choose in Settings which streaming services they use, saved to their account and synced (FR-06.3, FR-11.8). The album panel and New album SHALL show empty link fields only for those, while saved links always show and a link from any service can still be pasted (TON-138).

#### Scenario: Qobuz turned off
- **WHEN** a person turns Qobuz and Tidal off, and opens an album with a Tidal link in Editing mode
- **THEN** the panel offers Spotify and Apple Music, not Qobuz, and still shows the Tidal link
