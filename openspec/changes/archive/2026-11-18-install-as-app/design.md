# Design

## Context

`/manifest.webmanifest` (TON-115) names the app, starts at `/c` and displays `standalone`, so Chrome and Edge on a computer offer to install it and Safari's Add to Dock opens it in its own window. Chrome reports no installability errors for it on a computer. Nothing in the app mentions installing, and Safari never offers to.

## Decisions

- **One section, at the end of Preferences, on every device** (the creator's choices, 18 November 2026). Its text follows what the browser tells (`installAdvice`, `features/shell/install.ts`):
  - an installed app's window (`display-mode: standalone`, or iOS's `navigator.standalone`): running as an installed app;
  - after the prompt's install: installed;
  - Chrome or Edge's kept `beforeinstallprompt`: a button that opens the prompt, spent either way;
  - an iPhone or iPad, iPadOS's Safari included by its touch points: Share → Add to Home Screen;
  - Safari on a Mac: File → Add to Dock;
  - anywhere else, Chrome without an offer included: directions for Chrome, Edge and Safari, and "open it from your apps" if it's installed already. Firefox gets no claim of its own.
- **The offer is kept without `preventDefault()`,** so Android's own install hint still shows. It's watched from the router's start in the browser, since it fires once on load, before Preferences may be open.
- **Launches focus the open window.** `launch_handler.client_mode` is `["focus-existing", "auto"]`: a captured link brings the open window forward and hands its URL to `launchQueue`. `launchTarget` routes a same-origin URL that differs from the current one through the router, so unsaved input and the sync stream survive; the launch that opened the window and other origins go nowhere. `navigate-existing` would reload the page.
- **Focus after the prompt** moves to the section's heading, since the button is gone.

## Risks

- Browsers' install menus change names; the directions say "the address bar or the browser's menu" rather than a menu path.
- Chrome decides when to capture a link from another app into the installed app; Tonaris only decides what the window does with it.
- Not checked here: the real prompt and Add to Dock on a Mac, and a link captured from Mail. The tests use a synthetic offer, a stubbed display mode and a stubbed launch queue.
