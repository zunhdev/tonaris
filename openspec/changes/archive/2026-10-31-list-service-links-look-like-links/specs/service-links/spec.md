# Spec Delta

## ADDED Requirements

### Requirement: The list's service names read as links
In an album row's Services column and on an album card, each service name SHALL be shown as a link, underlined, with a mark that it opens outside Tonaris, taking the link colour on hover (FR-06.5, TON-125). It SHALL show no service logo (DS-19).

#### Scenario: A row with two services
- **WHEN** an owner views a list holding an album with Spotify and Tidal links
- **THEN** its row shows "Spotify" and "Tidal" underlined, each followed by ↗, each named "Open '{title}' in {service}"
