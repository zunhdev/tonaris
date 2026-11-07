# Spec Delta

## ADDED Requirements

### Requirement: Agents set folder and list colors
A Manage collection agent SHALL set a folder's or list's color, or clear it, with `set_color`, under the same rules and conflict checks as the app (FR-01.19, FR-10.4, TON-175). `list_container` SHALL return a folder's or list's own color.

#### Scenario: An agent colors a list
- **WHEN** a Manage collection agent calls `set_color` on the list 'Doom' with violet
- **THEN** the change is confirmed, and `list_container` returns 'Doom' with the color violet
