# Proposal

Linear: TON-76 (Feature). Implements FR-11.3, FR-11.7 and FR-11.13. Design: DS-92–DS-94. Done when the settings part of AC-38 and the defaults part of AC-16 are verified.

## Why

A display name can be set only from the sharing dialog (TON-65) or when joining (TON-75). There is nowhere to change or clear it later. DS-92's Settings starts with Profile, which doesn't exist yet.

The account defaults (DS-94, FR-11.7) already shipped with TON-35. The view-options e2e test "choices are remembered per view and synced, and defaults apply where none was made" verifies AC-16's defaults part. This change only checks them, rather than building them again.

## What Changes

- **Settings → Profile** (`/settings/profile`, DS-93): the display name, saved when the field loses focus or on Enter.
  - **Clearing it** removes the name while the person shares nothing.
  - **While they share,** clearing is refused with an inline error, and the field goes back to the saved name (AC-38).
  - **The account menu** shows the new name, or the email once it's cleared.
- **The Settings subnav** starts with Profile, in DS-92's order.
- **Docs:** DS-92 and DS-93 recorded as built.

The Account page (sign-in email, recovery link, danger zone) joins with TON-77–TON-79.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: the display name in Settings → Profile (FR-11.3).

## Impact

- **`apps/web`:** the Profile route and the subnav. The page uses the existing `account.setDisplayName` command.
- **No API, schema or OpenAPI change.**
