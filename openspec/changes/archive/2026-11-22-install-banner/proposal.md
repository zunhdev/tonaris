# Proposal

## Why

The creator wants Tonaris to suggest installing itself when it opens on an iPhone, as keenee.app does (22 November 2026). Today only Settings → Preferences (DS-94, TON-298) and Help say how, so few people on an iPhone find it. iOS gives pages no install prompt, so the suggestion can only show the steps. Linear: TON-323. Rules: section 2.2, DS-123.

## What Changes

- On an iPhone or iPad, outside the installed app, a banner at the bottom of the landing page and the workspace suggests installing Tonaris, with **Install** and **×**. Guests' shared pages, sign-in, Help and the legal pages don't show it.
- **Install** opens a sheet with the steps: Share, Add to Home Screen with a picture of the menu row, then Add. In the workspace it adds that the installed app asks to sign in once more. A line at its end copies the link for Safari.
- In an app's built-in browser, such as Threads', Instagram's or Facebook's, the sheet says to open Tonaris in Safari instead, with **Copy link**.
- **×** closes the banner for good on that device. While it shows, the workspace's main pane and the landing page end above it.
- Android and computers show none.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-web`: an iPhone or iPad suggests adding Tonaris to the Home Screen, and an app's built-in browser is sent to Safari.

## Impact

- `apps/web/src/features/shell/install.ts`, `install-banner.tsx`, the shell, the landing page, and `globals.css` for the room under the banner.
- Help: `start-here/install-the-app.mdx` says Tonaris suggests installing on an iPhone or iPad, and what to do in an app's browser. No Help pictures change: the phone pictures keep the banner closed.
