# Proposal

## Why

The creator wants a profile slightly richer than a display name: an avatar in a color you choose and a short About text, seen by the people you share with. Linear: TON-296, the third step of People and profiles (P-TON-57). Rules: the new FR-11.16, FR-07.3, FR-11.3, FR-11.13, FR-11.14, DS-31, DS-93, DS-121.

## What Changes

- **Settings → Profile** gains an avatar color, Automatic or one of 12 hues, and an About text, plain, up to 160 characters (`account.setAvatarColor`, `account.setAbout`, app-only).
- **The avatar** shows its color wherever it does, and joins the owner's name in Shared with me, the Invitations inbox and its notices, the "Shared by" pill and guest pages.
- **Your About** shows to your people only: those you invited and those whose invitations you accepted (FR-07.23), on your page in their People and in a card from the "Shared by" pill. Guests see the name and color only. Profiles stay out of exports and MCP.
- **The privacy notice** names the color and About and who sees them, under a new `termsVersion`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: the avatar color and the About text, and who sees them.
- `terms-and-privacy`: the notice names them.
