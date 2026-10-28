# Proposal

Linear: TON-47 (Feature). Implements FR-06.5 (an explicit service choice every time) and FR-06.6 (the app first where the platform allows, else the same service's web page, never another service). Design: DS-25, and DS-21's services column and Open button. Tech: TS-43, with the desktop app-scheme spike done first ([report](../../../docs/spikes/2026-10-28-desktop-app-links.md)). Done when AC-18 passes on desktop and mobile browsers.

## Why

Albums have their links on clients since TON-46, but nothing opens them except the inspector's plain links. AC-18 promises an explicit choice every time, the app where possible, the same service's web page otherwise, and failures explained without switching service.

## What Changes

- **The "Open in…" chooser** (DS-25) lists only the services the album has links for, in the services' order, by name, with no preselection and no remembered choice, even for a single link.
  - **Desktop:** a popover. "Open in Spotify" opens the canonical page in a new tab, and "App" beside it opens the desktop app through its scheme (the spike's table).
  - **Mobile:** a bottom sheet whose items open the canonical `https` URL, which the services' universal and app links hand to the installed app.
- **When the app may not have opened:** if the page keeps the focus 2 s after "App", the chooser says so and offers the same service's web page.
- **Opening it:** a row's trailing Open button, on hover or focus (DS-21), and `O` for the inspector's album or the focused album (DS-78). An album without links says so.
- **The rows' services column** (DS-21): the services the album has links for, by name, collapsing after the type as the view narrows.
- **Docs:** the spike report, TS-43 as built, and DS-21, DS-25 and DS-78.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: gains opening a service: the explicit choice, app or web, and failures explained without switching service.

## Impact

- **`apps/web`:**
  - `features/open/`: `appLink()`, which turns a canonical URL into the app's URI, and the chooser with its provider;
  - the album rows' services column and Open button;
  - `O` in the shortcuts;
  - `PopoverContent` takes an anchor element.
- **No API or schema change.**
- **Not here:** the cards' Open button (`O` works on cards too), and guest pages' chooser (M7).
