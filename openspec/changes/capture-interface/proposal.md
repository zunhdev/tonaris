# Proposal

Linear: TON-45 (Design). Implements, in the desktop app:
- FR-02.1, pasting album and track links of the four services to add albums;
- FR-02.2, capture into a list or without one;
- FR-02.3, track links that go to manual entry with the link kept;
- FR-02.4 and FR-02.5, failures that explain themselves, keep the link, and offer Retry and manual entry;
- FR-02.9 and FR-02.10, uncertain matches decided by the person, or left pending while the rest go on;
- FR-02.11, batches of links reported item by item;
- FR-15.3, refusals shown where the item is.

Design: DS-48 (and DS-47, DS-84 where capture meets them). Done when AC-06 passes end to end. Builds on TON-42 to TON-44 (identification, enrichment, `album.capture`) and TON-46 (links).

## Why

`album.capture` saves albums from links, but nothing in the app sends it: the only way to add an album is typing it in. DS-48's capture is the product's main way in, "Start your collection — paste an album link", and AC-06 is about what people see: links resolving, failures that keep the input and offer manual entry.

## What Changes

- **Paste anywhere:** ⌘V with no text field focused, on desktop, captures the links pasted. In a list they go to that list; elsewhere to none, with "Add to list…" offered.
- **The capture dialog,** from `C` or "+ Add album": one link per line, a destination, and "Enter manually".
- **Placeholder rows** at the top of the destination view: "Resolving link…", then the album; or the reason, with Retry, Enter manually and Dismiss. The link is kept until dismissed, across reloads.
- **Enter manually** opens the manual entry form prefilled: with what capture found, completing the capture with the link kept; or, after a failure, with the link in its service's field.
- **A decision card** for an uncertain match: "Which album is this?", the candidates with those already in the collection marked, "None of these" and "Decide later".
- **Outcome toasts** read the capture's result: reused, already in the list, restored from Trash, a kept link with Review.
- **Batches** of more than one link show a progress panel that opens their report. The report's items get Retry, Decide and Enter manually.
- **Sending:** captures go one request per link, in a lane of their own, after the writes made before them. They don't hold up later edits, and they survive reloads like any write.
- **The kept link:** the inspector offers "Another Spotify link was found for this album · Replace · Dismiss" (DS-46, FR-06.4).
- **The browser-test API** answers captures from a fixture table, so AC-06 runs end to end without MusicBrainz.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: gains the capture interface: pasting, the dialog, progress and failures in place, manual entry from a capture, the decision card, outcome toasts, batches, and how captures are sent.

## Impact

- **`apps/web`:**
  - **Client:** the outbox gains lanes, and a capture lane with a longer timeout; `captures.ts` sends and settles captures. The transport treats `409 in_progress` as no answer yet, and the save states keep a single write that needs input across reloads.
  - **Features:** `features/capture/` holds the paste handling, the dialog, the placeholder rows, the decision card, the panel and the outcome texts. The views, the sidebar's "+ Add album", the shortcuts, the manual entry form, the batch report and the inspector take them in.
- **`apps/api`:** the e2e server's stubbed capture providers. No API or schema change.
- **Docs:** DS-48 as built, DS-47's capture modes, DS-78's `C`, DS-84's capture actions, and TS-22's capture lane.
- **Not here:** album capacity and the usage meter (TON-60, DS-98), mobile capture, and MCP's capture tools (M9).
