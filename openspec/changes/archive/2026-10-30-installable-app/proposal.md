# Proposal

Linear: TON-115 (Feature). Implements section 2.2, X-04. Design: DS-110. Done when Chrome loads an installable manifest, iOS gets its icon and full screen, and the specs record it.

## Why

In the creator's manual testing (30 October 2026), they asked for Tonaris to be installable on phones, "probably PWA, or something similar", so it opens from the home screen like an app.

## What Changes

- **A web app manifest,** `/manifest.webmanifest`: "Tonaris", start URL `/c`, standalone display, the dark theme's colors, and TON-114's 192, 512 and maskable 512 px icons. The root document links it.
- **iOS:** `apple-mobile-web-app-capable`, its title and a black status bar, with TON-114's `apple-touch-icon`.
- **`theme-color`** for the system bars on Android.
- **No service worker:** Chrome's install criteria no longer need one, and the app stays online-only to open (section 2.3).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-web`: Tonaris installs on a phone's home screen.

## Impact

- **`apps/web`:** `public/manifest.webmanifest`, the root document's meta and links, `e2e/install.e2e.ts`.
- **Docs:** PRD section 2.2 and its decision log, DS-110 as built.
