# Proposal

Linear: TON-35 (Feature). Implements FR-05.1 and FR-05.5–FR-05.10, the sorting, chronology and grouping rules, and FR-11.7–FR-11.8, account defaults and remembered per-view choices, saved to the account. Also covers FR-05.3–FR-05.4's sorting at the root and in Unsorted, and FR-09.2's preference sync. Design: DS-24, DS-42–DS-44, DS-49 (View options; rearranging is TON-36) and DS-94, with DS-21's type column and DS-41's date column. Verifies AC-14, AC-15 and AC-16, except AC-16's shared and guest parts, which wait for sharing (M7).

## Why

TON-34 shows each view's contents, but only in one fixed order: albums chronological ascending, folders and lists in creation order. Nobody can sort by name, reverse a sort, or group a list by release type. A Grid choice stays on one device. FR-05 makes presentation personal, and FR-11.7–FR-11.8 make it follow the person to every device, with defaults for the views they haven't set. TON-36's manual order and M7's personal views of shared content build on these choices.

## What Changes

- **Sort modes and directions** (FR-05.1, DS-42):
  - lists and Unsorted sort albums by **Year**, **Name** or **Manual**;
  - folders and the root sort their folders and lists by **Name**, **Created** or **Manual**.
  - Year, Name and Created go ascending or descending.
  - Under Name and Created, folders come first, then lists. Manual is one mixed sequence.
- **Manual order until TON-36** follows DS-44's fallbacks: a list's albums in the order they were added, folders and lists in the order they were made, and Unsorted newest first (DS-51). Rearranging comes with TON-36.
- **The chronological rule** (FR-05.5, FR-05.6): albums sort by original year, and live albums by their recording year or the start of their range, falling back to the original year.
- **Chronology display** (DS-24):
  - a live album's recording year shows with a small `rec.` prefix;
  - a live album whose recording year is unknown shows its release year with a fallback marker. Its tooltip and accessible label say "Recording year unknown — sorted by release year".
- **Release-type grouping** (FR-05.7–FR-05.9, DS-43):
  - lists and Unsorted can be grouped into Album → EP → Live → Compilation → Unclassified, a fixed sequence;
  - live comes before EP and Compilation, and singles and unknown types go to Unclassified;
  - sticky headers show each group's name and count, and empty groups are hidden;
  - a group can be collapsed for the browser session;
  - while grouped, the release-type column is hidden (DS-21).
- **Grouping and sorting are independent** (FR-05.8): switching one never changes the other, and the selected order applies within each group.
- **View options** (DS-49): a View button in the header of every collection view, or `V`, opens a popover with these sections:
  - Sort;
  - Direction, disabled for Manual;
  - Grouping and Layout, for lists and Unsorted only;
  - a footer with **Use account defaults** and **Save as my default**.

  As the creator asked in TON-34's notes, the Rows | Grid switch moves from the header into View options.
- **Remembered choices and account defaults** (FR-11.7, FR-11.8, FR-09.2, DS-44, DS-94):
  - **What is remembered.** Each choice a person makes in a view is remembered for that view: the sort with its direction, the grouping, and the layout. A choice they haven't made follows their account defaults.
  - **The first-time defaults:**
    - Year ascending, combined and Rows for lists and Unsorted;
    - Manual for folders and the root.
  - **Saved to the account** and synced to every session.
  - **Keeps the device's layouts.** A Grid choice kept on the device since TON-34 becomes the view's saved layout the first time the workspace loads.
- **Settings → Preferences** (DS-94, DS-92):
  - the defaults for lists and for folders;
  - a note that remembered choices are kept when the defaults change;
  - a Settings subnav for the two settings pages built so far, Preferences and Connections.
  - The account menu's "Connections" becomes "Settings", and G then S goes to Preferences.
- **Folder rows** show a Created column when sorted by creation date (DS-41).
- **The sidebar tree follows each level's sort** (decided with the creator on 23 October 2026). The tree lists each folder's contents, and the root's, as that folder's or the root's view is sorted.
- **Conflicts and save states** cover preferences too (FR-09.4).
  - **Field-level CAS:** preference writes carry the values they replace.
  - **A newer choice from another session** is a conflict for review, not a silent overwrite.
  - **Activity and failure toasts** cover them like any write.
- **Docs:**
  - DS-21, DS-24, DS-41–DS-44, DS-49, DS-78, DS-92 and DS-94 as built;
  - TS-11's `account_settings` and the protocol in `docs/api/sync-protocol.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`:
  - **Changed:** the fixed TON-34 orders give way to sort modes and directions, and the device-kept layout to a remembered, synced one.
  - **Added:** chronology display, release-type grouping, View options, account defaults and Settings → Preferences.
- `app-shell`: "Keyboard shortcuts move around the workspace" gains `V`, and G then S goes to Settings → Preferences. The tree follows each level's sort.
- `sync-and-conflicts`: "A change made from a stale value is a conflict" now covers personal preferences (FR-09.4).

## Impact

- **Domain** (`packages/domain`):
  - `views.ts`: sort modes, view preferences, account defaults, and the `view.set` and `defaults.set` commands with CAS;
  - `sync.ts`: the new envelopes, the `view` and `defaults` changes, and the bootstrap's `views` and `defaults`.
- **Database** (`packages/db`):
  - a migration adding `account_settings`, and a sort-mode CHECK on `view_prefs`;
  - the store, and the bootstrap snapshot.
- **API:** no new routes. `POST /v1/mutations`, `POST /v1/batches`, the bootstrap and the stream carry the new shapes, which are additive to `/v1`. The OpenAPI document is regenerated.
- **Web client** (`client/sync`):
  - `views` and `defaults` collections;
  - retries, dependencies and descriptions for the new writes.
- **Web app:**
  - in `features/collection`: the order, grouping, presentation, View options, group headers, the year display and the folder date column;
  - the Settings → Preferences route and subnav;
  - the account menu, and the shortcuts and their reference.
- **UI package:** a segmented control on Base UI's radio group.
- **E2E:** new accounts and `e2e/view-options.e2e.ts`. TON-34's test switches layouts through View options.
