# Design

## Context

- **Built:**
  - `album_service_links` (TS-11): PK `(album_id, service)`, the canonical `url`, `entity_id = linkEntityId()`, and the owner copied from the album;
  - `parseLink()` and `resolveShortLink()` in `@tonaris/providers/links` (TON-39). Parsing is browser-safe; following a short link needs `safeFetch`;
  - capture fills an absent link and keeps a different one, reporting `keptLink` (TON-44). Its link writes don't reach clients: clients hold no links.
- **Clients** hold albums, containers, entries, view choices, defaults and positions (TS-24). Every edit is a mutation with `base` values (TS-21), sent through the outbox, and a conflict is reviewed field by field (DS-80).
- **The inspector** shows "Links to Spotify, Apple Music, Qobuz and Tidal arrive with link capture." and the manual entry form a line like it (TON-38).

## Goals / Non-Goals

**Goals:**
- Links on clients, edited by hand with the same rules as capture: one per service, canonical, never another service's.
- The same reasons capture gives for input it can't read (DS-48), in the inspector and the form.
- AC-19 through the API: a kept link replaced explicitly, the membership kept.

**Non-Goals:**
- **Opening a service** (TON-47): the "Open in…" chooser, app-first opening, and the rows' services column. The inspector's rows open the web page meanwhile.
- **The kept-link toast** and the inspector's "Another Spotify link was found" notice (TON-45), which read capture's result.
- **MCP's link tools** (M9).

## Decisions

### 1. The record and its key

```ts
ServiceLink = { albumId: uuid; service: StreamingService; url: string } // the canonical URL
serviceLinkKey(albumId, service) = `${albumId}:${service}`
```

- **A change** is `{entity: "link", id: serviceLinkKey(…), op, data: ServiceLink | null}`.
- **The bootstrap snapshot** gains `links`, the owner's links ordered by album and service.
- `entity_id` stays on the server: clients compare canonical URLs, which the server wrote.

**Why a record of its own** rather than fields on the album: each link is edited, compared and conflicted on its own, as entries are, and the album's fields keep their provenance rules (TS-15).

### 2. The mutations

```ts
link.set    { albumId, service, url }  base { url: string | null }  // add (null) or replace
link.remove { albumId, service }       base { url: string }
```

- `url` is the text as pasted, up to 2,048 characters (TS-40).
- `base.url` is the canonical URL the client last saw, or null for none.
- Both answer `confirmed` with a null result.

### 3. Reading the link (API, before the lock)

The domain can't import `@tonaris/providers`, which depends on it. So the API reads `link.set`'s URL first, as capture prepares its source, and hands the command a `PreparedLink`:

```ts
PreparedLink = { status: "parsed"; link: CapturedLink } | { status: "failed"; failure: Failure }
```

- `parseLink()`; a short link is followed with `resolveShortLink()` through `safeFetch`, as identification does (TS-41 step 0).
- The `failed` case carries `unsupported_link` or `provider_unavailable` with its reason. The command returns it, so `executeMutation()` stores it like any outcome and a retry replays it.
- **Batches:** the API's item runner prepares a `link.set` item the same way.
- **No claim:** following a short link takes at most three requests with their timeouts, and nothing is written outside the lock. A copy sent meanwhile waits for the lock and replays the stored outcome.
- **Without a prepared link,** as in a test that passes none, the command fails with `validation_failed`.

### 4. The commands (domain, under the lock)

`setLink(args, base, context)`:
1. The album must exist and be the principal's to write (`not_found`, `permission_denied`).
2. The prepared link: a failure is returned as is. A link of another service is `unsupported_link`: "This is an Apple Music link. Paste a Spotify link here."
3. **Compare-and-set:** the saved link's URL, or null, must equal `base.url`. Otherwise `conflict` on the field `url`, with the current, attempted and base values.
4. **The same URL** changes nothing (`confirmed`, no changes). Another one is saved with its `entity_id`, as an insert or an update.

`removeLink(args, base, context)`: the same checks, then the row is deleted. A link already gone changes nothing, as removing an absent entry does.

**Capture** now emits a `link` insert when it saves a link (TON-44's `keepLink()` and `create()`).

**The store** gains `saveServiceLink(albumId, ownerId, link)` (insert or replace) and `deleteServiceLink(albumId, service)`. `insertServiceLink()` stays for capture.

### 5. The web client

- **`links` collection** (`client/sync/links.ts`) from `snapshotCollection`, keyed by `serviceLinkKey`:
  - insert → `link.set` with `base.url: null`; update → `link.set` with the original URL; delete → `link.remove`;
  - the optimistic row holds the text as typed until the stream brings the canonical URL.
- **Checking before sending:** `checkLink(service, text)` parses with `parseLink()` and answers the reason the server would give: the TS-40 reason, or another service's. A short link passes; the server follows it.
- **Describing** (DS-81): "Add the Spotify link to 'Bleach'", "Replace the Spotify link of 'Bleach'", "Remove the Spotify link from 'Bleach'". A conflict's field `url` is labelled "Link".
- **Retrying** (`resubmit.ts`): a `link.set` is made again from the current link, and a `link.remove` likewise; an album gone is `gone`.
- **Dependencies:** a `link.set` refers to its album, so in a request with the album's creation it depends on it.

### 6. The inspector's Links section (DS-46)

- **Viewing mode:** a row per linked service: the service's name, and the URL's host and path, as a link that opens the page in a new tab. With none: "No links yet."
- **Editing mode:** every service has a row.
  - **A linked service:** Replace and Remove.
  - **Replace** turns the row into a field with the URL selected. Enter or leaving it saves; Escape discards. A refusal stays under the field, as the other editors' do (DS-45).
  - **Remove** removes the link at once, with "Removed the Spotify link" and Undo (DS-50). Undo sets it back.
  - **A service without a link:** "Add Spotify link", which opens the same field, empty.
- **Offline:** the editors are read-only, as the album's are (DS-81).

### 7. Manual entry (DS-47)

- **Links** replace their placeholder line: one optional field per service, labelled "Spotify link" and so on.
- **Checked when left and on submit** with `checkLink()`, their errors joining the form's summary.
- **Saving:** the album, then its links in one transaction, then its entry in the list. The outbox sends them in that order, and a failed link shows in Activity like any write, with Retry.
- **Edit on a failed album save** reopens the form with the album as entered, as before. Its links, refused as `not_found` with it, are retried or dismissed from Activity; the form's checks make an album that fails rare.

## Risks / Trade-offs

- **[A short link that can't be followed]** → `provider_unavailable` with "Couldn't reach Spotify to open this short link. Try again." The field keeps the text, so Retry sends it again.
- **[Two albums with the same link]** → Allowed: FR-06.2 limits links per album, not per collection, and TS-44 keeps two records for one album when MusicBrainz does. A capture of that link reuses the active, oldest one (TON-44).
- **[An optimistic URL that isn't canonical]** → The row shows the text as typed for a moment, then the canonical URL from the stream. The save marker covers that moment.

## Migration Plan

No schema change. `link.set`, `link.remove`, the `link` change and the bootstrap's `links` are additive in the OpenAPI document; clients built before ignore them.
