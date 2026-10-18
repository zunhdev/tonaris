# Spec Delta

## Purpose

The visual foundation every Tonaris screen is built from: the dark theme, its tokens, typography and contrast guarantees (Q-02, Q-10; DS-10–DS-20).

## ADDED Requirements

### Requirement: Dark theme only
Every page SHALL render in the dark theme (Q-10, DS-11): the document declares the dark theme and a dark color scheme, so browser-drawn parts such as scrollbars and form controls are dark too. No theme switcher is offered in the first version.

#### Scenario: A page loads dark
- **WHEN** any page of the web app loads, server-rendered or client-only
- **THEN** the root element carries `data-theme="dark"` and `color-scheme: dark`, and the page background is `bg.app`

### Requirement: Components use semantic tokens
Colors SHALL come from three token layers (DS-10): primitives, semantic tokens (`bg.*`, `fg.*`, `border.*`, `accent.*`, `status.*`, `focus`) and component tokens. Components SHALL read only semantic or component tokens, never primitives, so a future light theme remaps the semantic layer without touching components.

#### Scenario: Semantic values match the design spec
- **WHEN** the dark theme's semantic tokens are read
- **THEN** each one has the value the design spec lists for it (DS-12, as tuned against DS-14)

#### Scenario: Components avoid primitives
- **WHEN** the component styles are inspected
- **THEN** none of them references a primitive color directly

### Requirement: Text and boundaries meet the contrast targets
The theme SHALL meet DS-14 (Q-02): informational text at least 4.5:1 against every surface it appears on (`bg.app`, `bg.panel`, `bg.raised`, `bg.hover`), and input borders, the focus ring and status colors at least 3:1 against those surfaces. Text on the primary button fill SHALL also reach 4.5:1. Disabled text is exempt. An automated test SHALL enforce this.

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

### Requirement: Typography
Text SHALL use Inter Variable, served by Tonaris itself rather than a third-party font host, with the DS-13 fallback stack so scripts Inter lacks still render. The default UI text SHALL be 13px on a 20px line (`text.base`), with tabular numerals available for years, counts and dates.

#### Scenario: Inter loads from Tonaris
- **WHEN** a page loads
- **THEN** Inter Variable is requested from the web app's own origin, and no request goes to a font CDN

#### Scenario: Unsupported scripts fall back
- **WHEN** saved text contains characters Inter does not cover, such as CJK
- **THEN** they render in a system font from the fallback stack instead of as missing glyphs
