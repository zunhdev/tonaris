# Proposal

Linear: TON-46 (Feature). Implements:
- FR-06.2, one current link per service, stored canonical;
- FR-06.3, adding, replacing and removing links by hand, in the inspector and in manual entry;
- FR-06.4's explicit replacement: a kept link changes only through an edit the person makes.

Tech: TS-11 (`album_service_links`), TS-40 (parsing and canonical URLs), TS-21 (compare-and-set). Done when AC-19 passes. Builds on TON-39 (parsing) and TON-44 (capture, which already fills an absent link and keeps a different one).

## Why

Capture saves links on the server, but nobody can see them: clients don't receive links, and nothing edits them. AC-19 needs a kept link to be replaceable explicitly, and FR-06.3 needs links to be editable metadata. Opening a service (TON-47) and the capture interface's "Kept your existing link · Review" (TON-45) both need links on the client first.

## What Changes

- **Links reach clients.** A new synced record, the link `{albumId, service, url}`, comes in the bootstrap snapshot and on the stream, including the links capture saves.
- **Two mutations:**
  - `link.set {albumId, service, url}`, with `base.url` the link the client last saw, or null: adds or replaces the album's link for that service;
  - `link.remove {albumId, service}`, with `base.url`.
- **The server reads the link** as capture does (TS-40): pasted text is parsed locally against the allowlist, a short link is followed through `safeFetch`, and the canonical URL is stored with `linkEntityId()`.
  - A link of another service, or one that isn't a supported album or track link, is refused with its reason.
  - A link changed elsewhere since the client saw it is a conflict (TS-21).
- **The inspector's Links section** (DS-46): one row per linked service, opening its page. In Editing mode, Replace and Remove, and Add for a service without a link.
- **Manual entry** (DS-47) takes a link per service, checked as it is typed and saved with the album.
- **The web client** describes, retries and orders the new writes like the others, and the conflict review names the field "Link".

## Capabilities

### New Capabilities

- `service-links`: an album's links to the streaming services: one per service, canonical, synced to clients, and edited by hand.

### Modified Capabilities

None. Capture's rule for links (`link-capture`, "Capture fills an absent link and keeps a different one") is unchanged; its links now reach clients, which `service-links` states.

## Impact

- **`packages/domain`:** the link record and key, `link.set` and `link.remove` in `mutationSchema`, the `link` change and bootstrap field, the commands, `PreparedLink` in the command context, and capture's link changes. The store gains `saveServiceLink()` and `deleteServiceLink()`.
- **`packages/db`:** the store's new methods, links in the bootstrap snapshot, and `executeMutation()` passing a prepared link.
- **`apps/api`:** preparing `link.set`'s URL before the lock, for single mutations and batch items; the regenerated OpenAPI document. Every change is additive (TS-09).
- **`apps/web`:** the links collection, write descriptions, dependencies and retries; the inspector's Links section; the manual entry form's links.
- **No schema change.** `album_service_links` exists since TON-5.
- **Not here:** the "Open in…" chooser and the rows' services column (TON-47), and the capture interface's kept-link toast and the inspector's notice for it (TON-45).
