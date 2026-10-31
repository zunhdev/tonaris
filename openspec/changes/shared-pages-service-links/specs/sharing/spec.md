# Spec Delta

## MODIFIED Requirements

### Requirement: Guests open albums in their services
Each album on a guest page SHALL show its service links (FR-06.5) as the album list does: each service by name, as a link, opened without passing the page's address on (TON-127).

#### Scenario: Open in Spotify
- **WHEN** a guest views a shared list holding an album with a Spotify link
- **THEN** its row shows "Spotify" as a link, which opens the album in a new tab with no referrer
