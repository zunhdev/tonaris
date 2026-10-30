# Proposal

Linear: TON-105 (Feature). Implements FR-06.5 and FR-06.6. Design: DS-21, DS-22, DS-25. Verifies AC-18. Done when a list's cards and rows show their albums' links, each opening its service.

## Why

In end-product testing (30 October 2026), the creator found that an album's links could be opened only from the inspector or the "Open in…" chooser. A list's view should offer them directly.

## What Changes

- **Cards** (Grid layout) get a line under the year naming the services the album has links for: "Spotify · Apple Music".
- **Rows** (List layout): the services column ("Spotify, Tidal"), which was plain text, becomes the same links.
- **Each name is a link** that opens its service where the account's link setting says (TON-104): the web page or the app.
- **Clicking one** opens the service. It doesn't open the inspector or move the grid's focus.
- **Pointer only,** like a row's Open button. From the keyboard, `O` opens the chooser.
- **No logos** (DS-19). An album without links shows no line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: an album's card and row name its services, each a link to that service.
- `views-and-ordering`: a card shows the services the album has links for.

## Impact

- **`apps/web`:**
  - a `ServiceNames` component in `features/open/`;
  - the cards (`album-cards.tsx`), whose text area grows by a line;
  - the rows' services column (`album-rows.tsx`).
- **Tests:** `e2e/open-in.e2e.ts`.
- **Docs:** DS-21 and DS-22 as built.
- **No API change.**
