# Design

## Context

- **Links on clients** since TON-46: `{albumId, service, url}`, the canonical URL (TS-40).
- **The spike** ([report](../../../docs/spikes/2026-10-28-desktop-app-links.md)): every desktop app registers a scheme that names an album or a track. No browser tells a page whether an app opened.
- **TS-43:** on mobile, the canonical `https` URL; on desktop, the web page first and the app second.
- **The rows** (TON-34) have title, artist, year, type and status columns, as an ARIA grid with keyboard navigation by cell.

## Goals / Non-Goals

**Goals:** DS-25's chooser on desktop and mobile, DS-21's Open button and services column, and `O`.

**Non-Goals:** the cards' Open button, guest pages (M7), and any remembered or preferred service (FR-06.5 forbids one).

## Decisions

### 1. `appLink(url)`

`features/open/app-links.ts` reads the canonical URL with `parseLink()` and answers the app's URI:

| Service | App URI |
| --- | --- |
| Spotify | `spotify:{kind}:{id}` |
| Apple Music | the canonical URL with `https:` replaced by `music:` |
| Qobuz | `qobuzapp://{kind}/{id}` |
| Tidal | `tidal://{kind}/{id}` |

Anything that doesn't parse has no app link.

### 2. The chooser

`OpenInProvider` holds the album being opened and the element to anchor to. `OpenInChooser`, rendered once in the shell, shows it.

- **Desktop:** a popover anchored to the Open button, or to the focused element for `O`. `PopoverContent` gains an `anchor`.
  - "Open in…" with the album's title as its description.
  - **Each linked service,** in `streamingServices` order:
    - "Open in Spotify", a link to the canonical URL in a new tab (`rel="noopener noreferrer"`), which closes the chooser;
    - "App" beside it, a link to `appLink()`, named "Open in the Spotify app".
  - **The first item has the focus,** and Enter opens it.
- **After "App":**
  - if the window loses the focus within 2 s, the app came forward and the chooser closes;
  - otherwise the list gives way to "If the Spotify app didn't open, it may not be installed on this computer.", with "Open Spotify on the web" and Back.
- **Mobile** (the narrow-screen query): a bottom sheet, a dialog at the bottom of the screen, with full-width "Open in Spotify" links to the canonical URLs. There are no App links: universal and app links hand over to the app.
- **No links:** the Open button isn't shown, and `O` raises "'{title}' has no links to open." (info).

### 3. Rows (DS-21)

- **Services column:** after the type, "Spotify, Tidal" in `fg.tertiary`, truncated. It shows from 760 px of view width, and the type from 640 px, so it collapses first. The grid's template becomes an inline `grid-template-columns`, built from the columns shown.
- **The Open button:**
  - it sits in the status cell, beside the save marker, for albums with links;
  - it shows on the row's hover or focus, and always on touch screens;
  - it is pointer-only (`tabIndex` −1); `O` is its keyboard path;
  - a click on it doesn't open the inspector.

### 4. `O`

`O` joins the shortcuts (DS-78) and acts on the inspector's album, else the focused album. Opening isn't an edit, so it works in Viewing mode and offline.

## Risks / Trade-offs

- **[Focus as the signal]** → An app that opens without taking focus would show the message needlessly. The message is hedged, "may not be installed", and offers the web page, so nothing goes wrong. A browser's own "Open Spotify.app?" prompt holds the focus too: the person answers it within 2 s, or sees the message, which still offers the web.
- **[Apple's storefront]** → A link pasted without a storefront has none, so its `music://` lets Music pick the store, as the web page does.
