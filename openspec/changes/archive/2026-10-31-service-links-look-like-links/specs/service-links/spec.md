# Spec Delta

## ADDED Requirements

### Requirement: The album panel's links read as links
In the album panel, each service's link SHALL be shown in Tonaris's link colour, underlined, with a mark that it opens outside Tonaris (FR-06.2, FR-06.6, TON-123). It SHALL show no service logo (DS-19).

#### Scenario: A Spotify link in the panel
- **WHEN** an owner opens an album with a Spotify link
- **THEN** the panel shows the link's address in the link colour, underlined, followed by ↗, named "Open in Spotify"
