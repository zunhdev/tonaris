# Spec Delta

## ADDED Requirements

### Requirement: The neutrals lean toward the accent
The dark theme's neutral surfaces, borders and text SHALL carry the accent's violet-indigo hue, at about hue 274 with chroma up to 0.03, so the app reads as dark indigo rather than graphite (Q-10, DS-12, TON-167). The values SHALL still meet the contrast targets (Q-02, DS-14).

#### Scenario: The page background
- **WHEN** any page of the web app loads
- **THEN** its background is `bg.app`, OKLCH 0.16 0.021 274

#### Scenario: Contrast still holds
- **WHEN** the contrast test computes the new text and boundary tokens against the four surfaces
- **THEN** every ratio meets its DS-14 minimum

### Requirement: Covers have an edge and depth
Every album cover SHALL have a faint light edge inside it, so a dark cover keeps its outline on the dark theme (FR-03.4, DS-23, TON-167). Covers in album cards, on guest pages' grids and in the album panel SHALL also cast a soft shadow, the one exception to DS-16's shadows on floating layers only.

#### Scenario: A card's cover
- **WHEN** an owner views a list as cards
- **THEN** each cover shows a light edge and casts a soft shadow

#### Scenario: A row's cover
- **WHEN** an owner views a list as rows
- **THEN** each small cover shows the light edge, without a shadow
