# Spec Delta

## ADDED Requirements

### Requirement: The sign-in page says what Tonaris is
Both sign-in steps SHALL show, beside the card, what Tonaris does and what sets it apart: AI agents through MCP, folders within folders and lists, sharing, and export, and that it is invitation-only (DS-90). The card SHALL come first for keyboard and screen-reader users, and first on a phone. Other pages in the sign-in frame SHALL NOT show it.

#### Scenario: On the desktop
- **WHEN** a visitor opens the sign-in page on a desktop browser
- **THEN** the promo is on the left and the sign-in card on the right

#### Scenario: On a phone
- **WHEN** a visitor opens the sign-in page on a phone
- **THEN** the sign-in card comes first, and the promo below it

#### Scenario: Another page in the frame
- **WHEN** a person opens an approval page
- **THEN** it shows the card without the promo
