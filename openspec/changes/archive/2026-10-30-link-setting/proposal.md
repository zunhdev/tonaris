# Proposal

Linear: TON-104 (Feature). Implements FR-06.5 and FR-06.6 (revised 30 October 2026). Design: DS-25, DS-46, DS-94. Tech: TS-43. Verifies AC-18. Done when the setting is saved to the account and synced, and every signed-in link follows it.

## Why

In end-product testing (30 October 2026), the creator found that service links open the services' web pages, and wanted them to open the apps. They first chose app links with a web fallback. Then they simplified it to a setting: links open the web page or the app, as the person chooses. The 28 October spike found that every app registers a scheme naming an album, and TIDAL.app's `tidal:` was checked again.

## What Changes

- **A setting,** Settings → Preferences → Links → "Open links in": **Web page** or **App**.
  - It is saved to the account and synced, on every device.
  - It starts as Web page.
- **Every signed-in link follows it:** the "Open in…" chooser and phone sheet, the inspector's Links, and Shared with me.
  - **App** opens `spotify:album:{id}`, `music://music.apple.com/{sf}/album/{id}`, `qobuzapp://album/{id}` or `tidal://album/{id}`. Track links name their track the same way.
  - **Web page** opens the canonical page in a new tab, with no referrer.
- **Guests** get the web pages.
- **BREAKING (behavior):** the chooser's second "App" choice and its 2 s "may not be installed" message are removed.
- **API:** a new mutation, `defaults.setLinkTarget`. The account defaults in the bootstrap and on the stream gain `linkTarget`. Additive only (TS-09).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: links open the web page or the app, as the person's setting says. The app-first rule and its explanation are removed.

## Impact

- **`packages/domain`:** `linkTargets`, `accountDefaultsSchema`, `setLinkTarget`, and the `defaults.setLinkTarget` mutation.
- **`packages/db`:** `account_settings.link_target`, with a migration; the store and the bootstrap read it, and the export leaves it out.
- **`apps/api`:** the regenerated OpenAPI document.
- **`apps/web`:**
  - the defaults collection sends the new mutation, with resubmit, dependencies and descriptions;
  - the Preferences section;
  - `ServiceAnchor` and `ServiceChoices`, and the chooser, the inspector's links and the shared pages' popover.
- **Docs:** FR-06.6 and AC-18, the walkthrough's AC-18, DS-25, DS-46, DS-94 and TS-43.
