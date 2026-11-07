# Spec Delta

## MODIFIED Requirements

### Requirement: Text and boundaries meet the contrast targets
The theme SHALL meet DS-14 (Q-02): informational text at least 4.5:1 against every surface it appears on (`bg.app`, `bg.panel`, `bg.raised`, `bg.hover`), and an input's border under the pointer, the focus ring and status colors at least 3:1 against those surfaces. Text on the primary button fill SHALL also reach 4.5:1. Disabled text is exempt. An automated test SHALL enforce this.

#### Scenario: Body and secondary text are legible on every surface
- **WHEN** the contrast test computes `fg.primary`, `fg.secondary` and `fg.tertiary` against `bg.app`, `bg.panel`, `bg.raised` and `bg.hover`
- **THEN** every ratio is at least 4.5:1

#### Scenario: Controls are distinguishable
- **WHEN** the contrast test computes `border.strong`, `focus` and each `status.*` color against the same surfaces
- **THEN** every ratio is at least 3:1

#### Scenario: Primary buttons are legible
- **WHEN** the contrast test computes `fg.on-accent` against `accent.fill`
- **THEN** the ratio is at least 4.5:1

#### Scenario: A token change that breaks contrast fails the build
- **WHEN** a token is changed so that any pair above drops below its minimum
- **THEN** the test fails and names the pair and its ratio

## ADDED Requirements

### Requirement: Floating layers are frosted
Menus, popovers, the command palette, tooltips and toasts SHALL show `bg.raised` at 94% under a background blur, so what's behind shows as a soft tint (Q-10, DS-16, TON-168). Every text color on them SHALL keep 4.5:1 even over a white cover (DS-14). Dialogs and sheets SHALL stay solid over their scrim.

#### Scenario: A menu over the covers
- **WHEN** an owner opens the account menu
- **THEN** the menu's ground is `bg.raised` at 94% with a background blur

#### Scenario: Text over a white cover
- **WHEN** the contrast test computes `fg.primary`, `fg.secondary` and `fg.tertiary` on the frosted ground over white
- **THEN** every ratio is at least 4.5:1

### Requirement: Fields are filled, with a faint edge
Text fields, text areas and selects SHALL be filled with `bg.field` and edged in `border.subtle`, which SHALL turn `border.strong` under the pointer (Q-10, DS-20, TON-168). Focus SHALL keep the accent ring and a problem the danger edge. Text in a field SHALL keep 4.5:1 on the panel and in a dialog.

#### Scenario: A field at rest and under the pointer
- **WHEN** a person looks at the sign-in page's Email field, then points at it
- **THEN** it is filled with `bg.field` and edged in `border.subtle`, and the edge turns `border.strong`

#### Scenario: Text in a field
- **WHEN** the contrast test computes `fg.primary` and `fg.tertiary` in a field on `bg.panel`, `bg.raised` and `bg.app`
- **THEN** every ratio is at least 4.5:1
