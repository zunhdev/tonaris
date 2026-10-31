# Spec Delta

## MODIFIED Requirements

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
