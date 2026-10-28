# Design

## Context

- **`album.capture`** (TON-44) answers `confirmed` with `{albumId, match, alreadyInList, keptLink}`, `needs_input` (`match` with candidates, `details` with a reason and maybe a prefill), or `failed`. A copy sent while it runs answers `409 in_progress`. It takes seconds, longer while MusicBrainz's queue is busy.
- **The outbox** (TS-22) sends one entry at a time, in order, with a 10 s timeout. A 4xx with a problem fails every write in the entry, and any other answer is retried with backoff.
- **The save states** (TON-31, TON-32) track every write for markers, Activity and batch reports. A single write's failure or conflict is kept in the browser, and so is a batch report that didn't wholly save.
- **The manual entry form** (TON-38, TON-46) adds an album with links, and reopens as entered from Edit.
- **The browser-test API** (`apps/api/src/e2e-server.ts`) has no capture providers, so captures fail as `provider_unavailable` there.

## Goals / Non-Goals

**Goals:**
- DS-48's capture on desktop, with every outcome of `album.capture` handled where the person is.
- Captures that never block other edits, and are never lost or saved twice.
- AC-06 end to end in Playwright, with providers stubbed.

**Non-Goals:**
- **Capacity** (TON-60) and the usage meter (DS-98). A refusal shows its reason; the link to the meter comes with it.
- **Mobile capture** and **MCP's capture tools** (M9).
- **Server changes:** none beyond the e2e stub.

## Decisions

### 1. A capture lane in the outbox

A capture can take a minute, and the outbox sends in order, so a capture in it would hold up every later edit. Captures get a second outbox, a **lane**, from the same code:

- **`createOutbox({ lane })`** tags its entries with the lane. Kept entries without one are the main lane's, so entries kept before this change still send. A tab adopts a gone tab's entries lane by lane.
- **Order across lanes** (TS-22):
  - before sending a capture entry, the lane waits for `main.answeredBefore(entry.createdAt)`: every main entry made before it answered;
  - a capture into a list created just before it therefore finds the list;
  - main entries never wait for captures.
- **One request per link.** Each capture is its own entry, sent one at a time, so rows settle in order as each finishes. MusicBrainz's queue is global, so sending them in parallel wouldn't make a batch faster.
- **Timeout:** 120 s per capture request, instead of 10 s.
- **`409 in_progress`** is no answer yet, in both lanes: the entry is sent again after the backoff, and gets the stored outcome once the capture finishes. A capture's write is claimed on the server, so it is saved at most once.

**Alternative rejected:** captures in the main outbox with a longer timeout. A rename made during a 40-link paste would wait minutes.

### 2. `captures.ts`

`createCaptures({ outbox, engine, states })`, on the sync client as `client.captures`:

- **`send(args[])`** makes one `album.capture` per argument, with a new `mutationId`, and `albumId` as given or new.
  - It tracks them as pending, in one batch when there are two or more (`states.batchFor`), so a retry from a report joins it.
  - It enqueues each as its own entry, and settles each as its answer comes. A confirmed capture settles once the stream has delivered its `seq`, as other writes do.
- **`restored(entry, outcomes)`** tracks an adopted capture as unconfirmed until answered.
- **The save state's `key`** is the capture's `albumId`.
- **No 15 s "waiting to confirm":** a slow capture is still pending. A send without an answer shows as unconfirmed, as in the main lane.

### 3. A single capture's choice survives a reload

The save states keep a single write's `failed` and `conflict` outcomes in the browser. `needs_input` joins them, in the failures store, whose schema widens to take it. A batch's items are kept in its report, as before. So a capture waiting for a choice keeps its link across reloads (FR-02.5, FR-02.10).

### 4. Making a capture again

| Action | What is sent | The old state |
| --- | --- | --- |
| Retry (row, toast, report) | the same `{albumId, link, listId}`, as a new capture | dismissed |
| A candidate chosen | the same, with `releaseGroupId` | dismissed |
| Details saved from the form | the same, with `details` | dismissed |
| Enter manually after a failure | `album.create`, its links and its entry, as the form saves them (TON-46) | dismissed |

- **Retry** goes through `resubmit()`, so a report's Retry all includes captures. An album already saved under that ID is `unchanged`.
- **A new capture made from a batch item** joins its report (`states.within`).

### 5. Where a capture shows

- **Placeholder rows** sit at the top of the destination view, the list or Unsorted, in rows and in grid alike, whatever the sort. The album's final place isn't known until it is identified, so DS-48's "insertion point" is the top, where the person is looking.
  - **The rows** are the captures this browser made that aren't saved yet, oldest first: pending, unconfirmed, failed or needing input.
  - **Each row** has a skeleton tile and the link's host and path.
  - **Pending:** "Resolving link…" and `aria-busy`.
  - **Failed:** the reason, and Retry, Enter manually and Dismiss.
  - **Needs details:** the reason, and Enter manually and Dismiss.
  - **Needs a choice:** the decision card.
  - **Once saved,** the row goes and the album is in the view in its place, announced as "Added {title}".
- **The capture panel,** bottom right, shows while a batch of captures is open: "Adding 12 · 8 done · 2 need you · 1 failed". Clicking it opens Activity at the batch's report, where each item has its actions. It goes when the report closes or is dismissed.
- **Root and folder views** show no rows: their captures go to Unsorted. A single one's outcome is a toast with "Add to list…" or, failing, with its actions.

### 6. The decision card (DS-48, as TS-44 shapes it)

DS-48's "Is this the same album?" compared a saved album with a new one. Since G2 (TS-44), an uncertain match is a choice between MusicBrainz albums, any of which may already be in the collection. TON-44's notes said so. The card:

- **Asks** "Which album is this?", then lists each candidate's title, marked "In your collection" when it names a saved album, with its artist and year from it.
- **Choosing one** sends the capture again with its `releaseGroupId`.
- **"None of these"** opens manual entry for the capture (decision 7), which saves it unidentified with the link.
- **"Decide later"** folds the card to one line, with Decide. The item stays under Needs you.

### 7. Manual entry from a capture (DS-47)

`NewAlbumDraft` gains `capture`: the state it continues, its link, list, album ID, reason and prefill.

- **The banner** gives capture's reason, or DS-47's "We couldn't read this link — complete the details below." when there is none.
- **Asked for details** (`needs_input`, or "None of these"):
  - the form is prefilled with the prefill's values;
  - the link fields give way to one line, "The link is kept: {link}";
  - saving sends the capture with `details` and dismisses the old state.
- **After a failure:**
  - the pasted link goes into its service's link field when it parses;
  - saving adds the album as the form always does, and dismisses the failed capture.
- **The destination** is the capture's list.

### 8. Outcome toasts (DS-48)

A single capture's outcome raises a toast. A batch's raise none; its report and panel carry them.

| Result | Toast |
| --- | --- |
| `created`, its row on screen | none; "Added {title}" is announced |
| `created`, saved without a list from elsewhere | "Added '{title}' to Unsorted", with Add to list… (`L`) |
| `reused`, into a list | "Already in your collection — added to this list" |
| `reused`, no list | "Already in your collection" |
| `alreadyInList` | "Already in this list"; the album's row flashes |
| `restored` | "Restored from Trash and added", or "Restored from Trash" without a list |
| `keptLink` | "Kept your existing Spotify link", with Review, after any of the above |
| `failed` | "Couldn't add an album from this link", the reason, Retry and Enter manually (persistent) |
| `needs_input` | "Choose which album this link is", or "Add this album's details", with Decide or Enter manually (persistent) |

- **Review** opens the album's inspector.
  - It holds the alternative ("Another Spotify link was found for this album · Replace · Dismiss") while the album keeps the kept link.
  - Replace sets the pasted link, an ordinary `link.set` (FR-06.4).
  - The alternatives live in the tab's memory: the toast and the notice are for the session that captured.
- **The generic failure toast** (DS-80) skips captures, which have their own.

### 9. Starting a capture

- **Paste:** a `paste` listener on the document. It acts unless the target is a text field or inside a dialog, popover or menu (DS-78), the session is offline, or the screen is narrow.
  - **`linksIn(text)`** keeps the trimmed lines that look like links: `http(s)://` URLs, `spotify:` URIs, or a known host without the scheme. Other lines are dropped; a paste with none does nothing.
  - **Up to 200 links** per paste, one batch (TS-25). More are refused with "Paste up to 200 links at once."
  - **Edit intent:** switches to Editing first (DS-45).
- **`C`** joins the shortcuts (DS-78) and opens the capture dialog, switching to Editing first; it waits while offline.
- **The dialog** ("Add albums"):
  - a textarea, "One link per line";
  - the destination select from manual entry, defaulting to the list on view;
  - "Enter manually", which opens manual entry for that destination;
  - **Add**, or ⌘Enter. A submission with no link reads "Paste at least one Spotify, Apple Music, Qobuz or Tidal link." Lines that aren't links are captured too, so each gets its reason in its row.
- **Every "Add album"** opens the dialog: the sidebar's, the empty list's and the one below a list's rows. Manual entry is one step further, through "Enter manually".

### 10. The browser-test API

`apps/api/src/e2e-capture.ts` answers captures from a table keyed by canonical URL:
- an album of each service, and a Spotify track of one of them;
- a Tidal track link, which goes to manual entry;
- an Apple link with hints, which goes to manual entry prefilled;
- an ambiguous link, a release group without a year, and a slow link held for 2 s;
- one whose MusicBrainz is down.

Links are parsed for real; anything else is unidentified. `e2e-server.ts` passes it to the app.

## Risks / Trade-offs

- **[A long batch]** → 40 links take about 40 s to 2 minutes while MusicBrainz paces requests. The panel shows progress, and everything else stays usable.
- **[Captures without their rows]** → Captures made in another tab show their state only in this tab's Activity once adopted. A reload shows the page's own kept ones.
- **[In-memory kept-link alternatives]** → After a reload, the notice is gone; the album keeps its link, which was the safe outcome, and the inspector can still replace it.

## Migration Plan

Entries kept by the previous version have no lane and are the main lane's. The failures store's records gain a status they didn't have; older records still parse.
