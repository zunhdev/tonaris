# design-system Specification

## Purpose

The visual foundation every Tonaris screen is built from: the dark theme, its tokens, typography and contrast guarantees (Q-02, Q-10; DS-10–DS-20).

## Requirements

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

### Requirement: Typography
Text SHALL use Inter Variable, served by Tonaris itself rather than a third-party font host, with the DS-13 fallback stack so scripts Inter lacks still render. The default UI text SHALL be 13px on a 20px line (`text.base`), and 15px on a 22px line on phones (TON-136), with tabular numerals available for years, counts and dates.

#### Scenario: Inter loads from Tonaris
- **WHEN** a page loads
- **THEN** Inter Variable is requested from the web app's own origin, and no request goes to a font CDN

#### Scenario: Unsupported scripts fall back
- **WHEN** saved text contains characters Inter does not cover, such as CJK
- **THEN** they render in a system font from the fallback stack instead of as missing glyphs

#### Scenario: Larger on a phone
- **WHEN** the workspace is narrower than 768 px
- **THEN** rows and menus use 15px text, and the desktop keeps 13px

### Requirement: The logo identifies Tonaris
The sidebar, guest pages and the sign-in page SHALL show the logo's mark, a disc on a compact CD player, beside the name "Tonaris", and browsers SHALL get the mark as the favicon and the iOS home-screen icon (DS-19). The mark SHALL be defined once for the app and once as an SVG for the icons.

#### Scenario: A browser tab
- **WHEN** a page of Tonaris opens in a browser
- **THEN** its tab shows the mark, from the web app's own `favicon.svg`

#### Scenario: The sidebar
- **WHEN** an owner opens the workspace on the desktop
- **THEN** the sidebar's header shows the mark beside "Tonaris"

### Requirement: Page switches fade in
When the workspace switches to another page, its content below the header SHALL fade in over 120 ms, opacity only, with DS-17's enter easing (TON-140), while the old page goes at once. The sidebar, the page header, the Settings and Admin tabs and the offline banner SHALL stay still. A change that keeps the path, such as opening an album, is not a switch. Back, forward and reduced motion SHALL switch at once.

#### Scenario: A list opens
- **WHEN** a list is opened from the sidebar
- **THEN** its content fades in below its header, while the header and the sidebar stay at full opacity

#### Scenario: Back shows the page at once
- **WHEN** the person goes back to the page before
- **THEN** it shows without a fade

#### Scenario: Reduced motion
- **WHEN** the browser asks for reduced motion
- **THEN** pages switch without a fade

### Requirement: The album panel slides in and out
The album panel SHALL slide in from the right over 200 ms with DS-17's enter easing, and out with its exit easing; a phone's album sheet SHALL slide up and down (DS-17, TON-159). The view SHALL narrow or widen at once. Reduced motion SHALL fade it instead. Back, Forward, and a panel open as the page loads, SHALL show it at once.

#### Scenario: Opening and closing
- **WHEN** an owner clicks an album, then presses Esc
- **THEN** the panel slides in from the right, then slides out over the widened view, and is gone

#### Scenario: Reduced motion
- **WHEN** an owner who prefers reduced motion opens an album
- **THEN** the panel fades in, without moving

#### Scenario: Reloaded with an album open
- **WHEN** an owner reloads a list with an album open
- **THEN** the panel shows without sliding

### Requirement: Loaded artwork shows at once
Artwork the browser already has, such as a row's or card's shown again in the inspector, SHALL show at once, without DS-23's 150 ms fade; artwork still loading SHALL fade in as before (FR-03.4, TON-159).

#### Scenario: A card's artwork in the inspector
- **WHEN** an owner opens an album whose card shows its artwork
- **THEN** the inspector shows the artwork at full opacity, without fading it in

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
