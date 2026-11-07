# Spec Delta

## ADDED Requirements

### Requirement: The tree draws guide lines
Under every level above a tree row's own, the tree SHALL draw a faint line where that level's chevron sits, unbroken from row to row, so an open folder's branch reads as one down to its last child (Q-10, DS-27, TON-169). The lines SHALL take no pointer events and be hidden from assistive technology.

#### Scenario: Three levels deep
- **WHEN** an owner opens the list 'Doom' in the folder 'Thrash' in the folder 'Metal'
- **THEN** 'Metal' has no line, 'Thrash' one under Metal's chevron, and 'Doom' two, under Metal's and Thrash's

### Requirement: The account menu shows an avatar
The account menu SHALL show a round avatar: the first letter of the account's name, or of its email until it has a name, white on a color whose hue comes from a hash of that name (Q-10, DS-31, TON-169). The white letter SHALL keep 4.5:1 at every hue. On a phone, the top bar's Account button SHALL show it in place of the person icon.

#### Scenario: In the sidebar
- **WHEN** a person without a display name, signed in as 'nav-guides@…', looks at the sidebar
- **THEN** the account menu shows a round avatar reading "N" before the address

#### Scenario: On a phone
- **WHEN** a person signed in as 'phone@…' opens the workspace on a phone
- **THEN** the top bar's Account button shows the avatar reading "P"
