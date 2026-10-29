# Proposal

Linear: TON-103 (Feature). Implements section 2.2, X-04, Q-03 and AC-42's mobile browsing. Design: DS-110. Done when the mobile browsing workflows pass on the iPhone (WebKit) and Pixel (Chromium) profiles, with axe.

## Why

TON-94's browser matrix found that phones get the desktop shell. The sidebar takes most of the screen, and album titles are cut off. DS-110 specified a phone layout, but no issue built it. AC-42 asks for mobile browsing in iOS Safari and Android Chrome, so the creator chose to build it in M11.

## What Changes

Below 768 px:
- **Drill-down shell.** No sidebar. Each view's header becomes a top bar with Back to the view above, the name, the view's own controls, Search and Account. The account menu leaves out Admin and the shortcuts.
- **The root screen** lists the collection's folders and lists, then Unsorted, with its count, and Shared with me.
- **Rows:** album rows are 56 px, with 44 px artwork and the artist under the title. Folder and list rows are 48 px. Nothing is wider than the screen.
- **An album** opens in a sheet over the view. It's read-only, since phones are always in Viewing mode, with its links to open each service, and it takes the focus.
- **View options** open in a bottom sheet.
- **Desktop only:** Trash, Settings → Custom fields and admin say they're on the desktop app. Settings' row leaves out Custom fields. A shared view's "View only · Shared by …" moves under the top bar.
- **Tests:** `pixel` and `iphone` Playwright projects run `e2e/mobile.e2e.ts`. `bun run test:e2e` adds `pixel`, and `test:e2e:webkit` adds `iphone`.

## Capabilities

### New Capabilities

- `mobile-web`: browsing the workspace on a phone.

### Modified Capabilities

None.

## Impact

- **`apps/web`:**
  - the shell, the page header, the account menu, the inspector, album and container rows, view options, the views, settings' nav;
  - the sharing, Trash and admin headers, and `features/shell/desktop-only.tsx`;
  - `playwright.config.ts` and `e2e/mobile.e2e.ts`.
- **Docs:** DS-110 as built.
- **No API change.**
