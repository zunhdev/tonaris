# Spec Delta

## ADDED Requirements

### Requirement: Agents set folder and list icons
A Manage collection agent SHALL set a folder's or list's icon, or clear it, with `set_icon`, under the same rules and conflict checks as the app (FR-01.20, FR-10.4, TON-306). `list_container` SHALL return a folder's or list's icon.

#### Scenario: An agent gives a folder an icon
- **WHEN** a Manage collection agent calls `set_icon` on the folder 'Rock' with guitar
- **THEN** the change is confirmed, and `list_container` returns 'Rock' with the icon guitar
