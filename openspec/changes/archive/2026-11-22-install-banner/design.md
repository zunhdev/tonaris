# Design

## Context

Tonaris installs on an iPhone through Safari's Add to Home Screen (TON-115), and Preferences says so (TON-298). Safari has no `beforeinstallprompt`: a page can't open Add to Home Screen, only say where it is. Since iOS 16.4, Chrome, Firefox and Edge on iOS have it too; apps' built-in browsers don't.

## Decisions

- **Where** (the creator, 22 November 2026): the landing page and the workspace, on an iPhone or iPad only. Android's Chrome shows its own install hint, which TON-298 keeps. Guests' share pages are left out, since the installed app opens a collection a guest doesn't have.
- **Who sees it:** `installAdvice` already tells an iPhone or iPad, iPadOS's Safari by its touch points, and the installed app by `display-mode: standalone` or `navigator.standalone`. The banner shows for its `ios` answer, from the client only (`useSyncExternalStore` with a server snapshot of none), so the landing page's server render matches.
- **Built-in browsers** are told by the user agent: a known app's token (Instagram, FBAN/FBAV, Barcelona for Threads, LinkedInApp, Line, Snapchat, TikTok, GSA, MicroMessenger), or no `Safari/` at all, as a bare WKWebView has. No feature check tells them apart. An app using Safari's own view looks like Safari, so the steps sheet ends with "No Add to Home Screen? Copy the link and open it in Safari."
- **× is for good** (the creator): `tonaris:install-banner` in localStorage, through `common/storage.ts`. Where storage refuses, it stays closed for the page.
- **It covers nothing:** while `[data-install-banner]` is in the page, `body:has(...)` gives the workspace's main pane, the album panel from 768 px and the landing page 96 px of bottom padding, so views end above it. On a phone the album sheet, dialogs and toasts go over it.
- **Copy link** uses `navigator.clipboard.writeText`; if the browser refuses, the address shows in a field to copy by hand.
- **Tests** emulate an iPhone in Chromium and WebKit (`install-banner.e2e.ts`), so `bun run check` covers it; the iPhone project's phone tests and the Help pictures keep the banner closed.

## Risks

- iOS's menus move between releases. The steps follow Help's "Install Tonaris as an app", and the picture shows only the row.
- User agents change; a missed app's browser still gets the steps sheet with its way out.
- Not checked here: real Safari on an iPhone or iPad, and real built-in browsers.
