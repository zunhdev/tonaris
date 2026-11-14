# Tonaris sync protocol

How a client keeps an account's data in sync with the API and writes to it (TS-28). The web app is the first client. Native apps will implement the same protocol from this document and the OpenAPI document at `/v1/openapi.json` (committed as `apps/api/openapi/v1.json`), which holds every schema named here.

Nothing here assumes a browser. BroadcastChannel, IndexedDB and the leader tab are web-client details (TS-23, TS-24).

## Overview

The protocol has three parts:

1. **Bootstrap.** `GET /v1/sync/bootstrap` returns the account's data as of one point in its change sequence, `seq`.
2. **Stream.** `GET /v1/sync/stream` sends every change after a cursor, in `seq` order, then stays open for live changes.
3. **Writes.** `POST /v1/mutations` takes one change, and `POST /v1/batches` up to 200. Each answers with an outcome. A saved change also arrives on the stream, at its `seq`.

Every account has its own `seq`. It counts the account's saved changes from 1, without gaps. The data a bootstrap returns at `seq = N` plus the changes N+1, N+2, … is the account's current data.

## Authentication

- **Web:** the session cookie, sent with credentials from the web app's origin (TS-08, TS-102). Writes must be `application/json`.
- **Native apps:** an OAuth access token in `Authorization: Bearer` (TS-30), once native apps exist. Today no bearer token is valid on `/v1`.
- **No session** answers `401` with a problem whose `code` is `unauthenticated`. The client should treat it as signed out.

## Bootstrap

`GET /v1/sync/bootstrap` → `Bootstrap`:

```json
{
  "seq": 1342,
  "albums": [...],
  "containers": [...],
  "memberships": [...],
  "links": [...],
  "fields": [...],
  "fieldValues": [...],
  "views": [...],
  "positions": [...],
  "defaults": { ... },
  "trashUnits": [...],
  "references": [...]
}
```

- **One consistent point.** The records and `seq` come from one snapshot, so the data includes every change up to `seq` and none after it.
- **Contents today:**
  - albums, folders and lists (`containers`), and list entries (`memberships`). A folder or list carries its `description` and its own `color`, each null for none (TON-175);
  - the albums' links to the streaming services (`links`), one per album and service, as canonical URLs (TON-46);
  - the account's custom fields (`fields`), each with its options in order (TON-49);
  - the fields each album applies, with their values (`fieldValues`), Trash included (TON-50);
  - the person's remembered view choices (`views`), one record per view they made a choice in;
  - their manual order (`positions`), one key per arranged item;
  - their account defaults (`defaults`), always complete: DS-44's first-time defaults until they save their own. They include where service links open (`linkTarget`, TON-104) and the services the person turned off (`hiddenServices`, TON-138);
  - the owner's Trash, unit by unit (`trashUnits`), each `{id, kind, rootId, name, parentId, deletedAt, expiresAt, folders, lists, members, artist}` (TON-55).
    - `parentId` is the root's folder at deletion, null for the top level or an album.
    - `members` are the folders and lists deleted with the root, `{id, kind, name, parentId}` (TON-59).
    - `artist` is an album's credit.
  - the person's Shared with me (`references`), newest first, each `{containerId}`: the shared folders and lists they keep (TON-68). `GET /v1/shared` gives their names, owners, roles and availability.

  Later features join as new fields (TS-24).
- **Trash** (TON-55):
  - Albums, folders and lists come only when active, and entries only of active lists and albums. What is in Trash is in `trashUnits` (TON-55, TON-57).
  - Links and field values of albums in Trash are still included.
- **Artwork** (TON-48). Albums carry `artworkUrl`, set or cleared with `album.setArtwork {id, artworkUrl}` and `base.artworkUrl`; `album.create` makes an album without it. An album with `artworkUrl` carries `artworkSignature`, here and in album changes on the stream. Show the artwork only from `{API origin}/img/{artworkSignature}/{base64url(UTF-8 artworkUrl)}`, never from its own host (TS-103). A failed image means the fallback tile.
- **Compression.** Send `Accept-Encoding: gzip`. The bootstrap is about 2.3 MB of JSON for 5,000 albums, and under 0.5 MB gzipped (TS-120).

## The change stream

`GET /v1/sync/stream?after=<seq>` answers `text/event-stream`.

### Events

- **`change`**: `id` is the change's `seq`, and `data` is a `Change`:

  ```json
  { "seq": 1343, "entity": "album", "id": "…", "op": "update", "data": { ... }, "mutationId": "…" }
  ```

  - `data` is the whole record after the change, or `null` when it was deleted.
  - `mutationId` names the write that made it.
- **`reset`**: `data` is `{"reason": "cursor_expired" | "cursor_unknown"}`. The server can't continue from the cursor, and the stream ends.
  - `cursor_expired`: the history before it is gone (30 days).
  - `cursor_unknown`: the cursor is beyond the account's latest change, as one from another database would be.
- **Comment lines** (`: open`, `: keepalive`): the first starts the response at once, and later ones go out after 20 s without an event. Ignore them.

### Entities and keys

A client keeps one store per entity and applies each change by key:

| `entity` | `id` | `data` |
| --- | --- | --- |
| `album` | the album's ID | `Album` |
| `container` | the folder's or list's ID | `Container`: `{id, kind, parentId, name, description, color}`, `description` and `color` null for none |
| `membership` | `<listId>:<albumId>` | `Membership` |
| `field` | the field's ID | `CustomField`: `{id, name, type, options: [{id, label}]}` |
| `fieldValue` | `<albumId>:<fieldId>` | `FieldValue`: `{albumId, fieldId, value}`, `value` null when applied-empty |
| `link` | `<albumId>:<service>`, the service being `spotify`, `apple-music`, `qobuz`, `tidal` or `youtube-music` (since TON-131) | `ServiceLink`: `{albumId, service, url}` |
| `view` | the view key: `root`, `unsorted`, or a folder's or list's ID | `ViewPrefs` |
| `defaults` | the account's ID | `ViewDefaults`, never `null` |
| `position` | `<viewKey>:<itemId>` | `Position` |
| `trashUnit` | the unit's ID | `TrashUnit`: `{id, kind, rootId, name, parentId, deletedAt, expiresAt, folders, lists, members, artist}` |
| `reference` | the shared folder's or list's ID | `{containerId}`, `null` when it leaves Shared with me |

Clients must ignore entities they don't know. New ones are added within v1 (TS-09).

### Cursors and resuming

- Pass the last `seq` the client applied, as `?after=<seq>` or as the `Last-Event-ID` header.
  - The web app uses `?after=`, because a cross-origin `Last-Event-ID` needs a CORS preflight the API refuses (TS-102).
  - With no cursor, the stream starts at 0, the whole history.
- The stream replays every change after the cursor, then sends live ones. A client that applies them in order never misses or repeats one.
- A change whose `seq` isn't the next one means a bug or a lost event. Reconnect from the last applied `seq`.

### When the stream ends

The server ends a stream in four cases:

- **after `reset`:** bootstrap again, then stream from the new `seq`;
- **on deploy or shutdown:** reconnect;
- **when its session is signed out, revoked or expired**, within 30 s: the reconnect gets `401`, so treat the client as signed out (TS-23);
- **when the client goes away.**

**Reconnecting:**
- If the stream ended cleanly, reconnect at once.
- If connecting fails, back off with full jitter: a random delay between 0 and min(30 s, 0.5 s × 2^attempt). A deploy's clients then don't all return at the same moment.
- Treat a connection that sends nothing for 45 s, not even a keepalive, as dead.

## Writes

### A mutation

`POST /v1/mutations` with a `Mutation` envelope (TS-20):

```json
{
  "mutationId": "0199f5b2-…",
  "name": "album.update",
  "args": { "id": "…", "title": "Kind of Blue (Legacy Edition)" },
  "base": { "title": "Kind of Blue" }
}
```

- **`mutationId`** is a UUIDv7 made once per user intent and kept for every retry (TS-22).
- **New records** get a UUIDv7 the client makes (TS-10), so a retried create can't duplicate.
- **`base`** holds the prior value of exactly the fields being changed (TS-21). A field whose saved value differs is a conflict, and nothing in the mutation applies. Fields not named are never compared, so edits to different fields of one record both apply.
- **The mutations today:**
  - `album.create`, `album.update`, `album.setArtwork`, `album.capture`;
  - `container.create`, `container.rename`, `container.move`, `container.describe`, `container.setColor`, `container.delete`;
  - `trash.recover`, `album.delete`, `trash.purge`;
  - `membership.add`, `membership.remove`;
  - `link.set`, `link.remove`;
  - `field.create`, `field.rename`, `field.changeType`, `field.addOption`, `field.renameOption`, `field.removeOption`, `field.delete`;
  - `fieldValue.apply`, `fieldValue.set`, `fieldValue.remove`;
  - `view.set`, `defaults.set`, `defaults.setLinkTarget`, `defaults.setHiddenServices`;
  - `share.invite`, `share.setLink`, `share.setRole`, `share.resendInvitation`, `share.accept`, `share.decline`, `share.leave`, `share.revoke`, `share.saveLink`, `share.removeReference`, `account.setDisplayName`;
  - `order.set`.

  That is 43. The OpenAPI document has each one's `args` and `base`.
- **`album.capture`** saves the album a pasted link names (FR-02.1, TS-44): `{albumId, link, listId}`, where `albumId` is the ID a new album gets and `listId` may be `null` for Unsorted.
  - **It may reuse an album** of the owner's, in Trash or not, and its `confirmed` result says so: `{albumId, match: "created" | "reused" | "restored", alreadyInList, keptLink}`.
  - **It may need input** (TS-26): `match` with candidate albums, or `details` with a prefill. Resubmit as a new mutation with `releaseGroupId` or `details` added.
  - **The server asks metadata sources before saving,** so the request can take seconds. A copy sent while it runs answers `409 in_progress` (below).
  - **It sends the album's link** as a `link` change when it saves one (TON-46).
- **Trash** (FR-01.11 to FR-01.16), for folders and lists (TON-55):
  - **`container.delete`** `{id, unitId}` moves a folder or list, with its active descendants, to Trash as one unit.
    - `unitId` is a UUIDv7 the client chose.
    - The stream sends a `container` delete for each, a `membership` delete for each entry of the trashed lists, positions for albums entering Unsorted at its top, and the `trashUnit` insert.
    - The entries stay stored for recovery.
  - **`trash.recover`** `{unitId, parentId?, name?}` returns a unit to its root's parent, or to `parentId` (null for the root), named as before or `name`.
    - With the parent missing or in Trash and no `parentId`, it answers `needs_input` `destination`, candidates `[{unitId, name, parentId, reason: "missing" | "trashed"}]`.
    - With the name taken among the new siblings, it answers `needs_input` `name`, candidates `[{unitId, name, parentId}]`. Resubmit with the choice (TS-26).
    - The stream sends the containers and the entries with active albums back, and the `trashUnit` delete.
    - **Its `confirmed` result** lists what stayed out: `{skipped: [{albumId, title, artist, listId, reason}]}`. `reason` is `album_in_trash` (with the list), or `album_deleted` for an album purged while the unit referred to it (`listId` null) (TON-56).
- **Albums in Trash** (FR-14.1 to FR-14.3, TON-57):
  - **`album.delete`** `{id, unitId}` moves an album to Trash as its own unit. The stream sends the `album` delete, a `membership` delete per entry in an active list, positions, and the `trashUnit` insert.
  - **`trash.recover`** on an album unit brings back its entries in active lists and reports those in trashed lists (`list_in_trash`, with `listName`). With none, the album enters Unsorted at its top.
  - **An active album of the same release group** makes it answer `needs_input` `match`, candidates `[{unitId, albumId, title, artistCredit, originalYear}]`; nothing changes.
- **Permanent removal** (FR-01.17, FR-01.18, FR-14.5, TON-58):
  - **`trash.purge`** `{unitIds}` removes units for good. It is app-only (`app_only` through MCP).
    - Its `confirmed` result is `{purged, gone}`; units already gone are reported, and the rest still go.
    - It takes at most 5,000 units (`maxPurgeUnits`). Trash can hold more, so a client empties a fuller Trash with several purges and adds up their `gone` (TON-148).
    - The stream sends each unit's `trashUnit` delete, and for a purged album its `link` and `fieldValue` deletes.
  - **The hourly expiry** sends the same changes, with `mutationId` null, for units 30 days old.
  - **Later recoveries** report what was purged: `album_deleted` in a list's recovery, `list_deleted` in an album's restore.
- **Sharing** (FR-07.1, FR-07.4, FR-07.16, FR-11.3, TON-65). These are app-only (`app_only` through MCP), except `share.saveLink` and `share.removeReference` (below). Most change nothing a client holds, and so log no change; the owner reads the state with `GET /v1/containers/{id}/sharing`.
  - **`share.invite`** `{grantId, containerId, email, role?}` invites the account that signs in with `email`.
    - `role` is `view` or `edit` (FR-07.18), `view` unless given. See [Editors](#editors).
    - Its `confirmed` result is `{grantId, status}`.
    - Someone already invited, or viewing, keeps their invitation: the result names it.
    - No account: `recipient_not_found`. Yourself: `validation_failed`.
  - **`share.setRole`** `{grantId, role}`: the owner changes a pending or accepted invitation's role. The person doesn't accept again; their access follows from their next read. It works while the folder or list is in Trash, as revoking does. Its `confirmed` result is `{grantId, role}`. An invitation that is gone, or no longer pending or accepted, is `not_found`; one on someone else's folder or list is `permission_denied`.
  - **`share.setLink`** `{containerId, linkId, enabled}` turns the link on, keeping a live one, or off for good.
    - Its result is `{linkId}`, null when off.
    - A new link takes `linkId`; the API derives its token and stores only the token's hash (TS-32).
  - **`account.setDisplayName`** `{displayName}` sets the name, trimmed; blank or null clears it.
  - **Email** (TON-66): a new invitation reports `emailing: true`, and its email goes to the recipient's current address after the response. The owner sees how it went in `GET /v1/containers/{id}/sharing` as `emailStatus`: `sending`, `sent`, `failed`, or `unknown`. **`share.resendInvitation`** `{grantId}` sends it again. A replay never sends twice.
  - **Answering** (TON-66): the recipient's **`share.accept`** and **`share.decline`** `{grantId}`. Accepting saves the collection to their references. Anyone else's invitation, or one no longer pending, is `not_found`.
  - **Ending access** (TON-67):
    - **`share.leave`** `{containerId}`: the viewer leaves the share they accepted by invitation, and their reference goes unless it was saved through a link;
    - **`share.revoke`** `{grantId}`: the owner revokes a pending or accepted invitation.

    Neither comes back through Trash recovery, and other paths stay.
  - **Shared with me** (TON-68):
    - **`share.saveLink`** `{token}` keeps a link's folder or list, or points an existing reference at this link. The token travels in the body, which is never stored. A link that doesn't work is `not_found`; your own is `validation_failed`.
    - **`share.removeReference`** `{containerId}` drops one, accessible or not, and revokes no grant.
    - **Through MCP,** a Manage connection may send these two, as part of the person's collection (FR-10.4). A Read-only one may not.
    - **The changes:** these, `share.accept` and `share.leave` log `reference` changes (`data: {containerId}` or null). The bootstrap carries `references`.
    - **The reads:** `GET /v1/shared` lists the entries, each with its owner, `via` (invitation, link), `available`, and the name only while available. `GET /v1/s/{token}/reference` tells a signed-in visitor `{saved, own}`.
  - **Signed-in viewers** (TON-69): `GET /v1/shared/{id}` gives a folder or list the person reads through sharing, in the guest page's shape with their `role` and a `seq` (see [Editors](#editors)); anything else, their own included, is `404`. `GET /v1/shared/{id}/stream` sends `shared-invalidate` after each of the owner's saves, revoking access included, so the page reads again.
  - **Guests** (TON-70), with no session:
    - `GET /v1/s/{token}` gives a link's content: the root, its active folders and lists, their albums with signed artwork, links, and the fields they use. Any link that doesn't work is `404`.
    - `GET /v1/s/{token}/stream` sends `shared-invalidate {rootId}` (the `SharedInvalidate` component) after each of the owner's saves.
  - **The recipient's reads:** `GET /v1/invitations` lists pending invitations; `GET /v1/invitations/{id}` answers `{state}`: `pending` or `accepted` (with `invitation`), `wrong_account`, or `unavailable`.
  - **Display name:** inviting or turning a link on needs one (`display_name_required`). So does keeping one while any invitation is pending or accepted, or any link is on.
- **Descriptions** (FR-03.5): **`container.describe`** `{id, description}`, with `base.description`, sets a folder's or list's plain-text description. It is trimmed, and empty text or null clears it. At most 2,000 characters; not in Trash (`trashed`). `container.create` makes none (TON-54).
- **Colors** (FR-01.19, TON-175): **`container.setColor`** `{id, color}`, with `base.color`, sets a folder's or list's own color, or clears it with `null`. `color` is one of `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet` and `pink`. The stream sends the whole `container`. A folder or list without its own color shows its nearest folder's above it. Clients work that out; nothing stores it.
- **Custom fields** (FR-03.6, FR-03.9, FR-03.11), defined per account (TON-49):
  - **`field.create`** `{id, name, type, options}` defines a field: `text`, `number`, `date`, `yes_no`, `single_choice` or `multiple_choice`. Only choice fields take options, each `{id, label}`, kept in the order given.
  - **`field.rename`** `{id, name}`, with `base.name`, renames it everywhere.
  - **Names** are unique per account across types, and labels within their field, case-insensitively (`name_conflict`). At most 50 fields and 100 options each (`limit_exceeded`).
- **A field's type and options** (FR-03.12 to FR-03.17), each change sending the whole field as a `field` change (TON-51):
  - **`field.changeType`** `{id, type}`, with `base.type`:
    - it changes the type only while no album applies the field, in Trash or not, even empty. Otherwise it is `field_in_use`: "Used by 3 albums (1 in Trash). Create a new field of the type you need instead.";
    - options stay between `single_choice` and `multiple_choice`, and any other type discards them;
    - its `confirmed` result is `{discardedOptions: [{id, label}]}`.
  - **`field.addOption`** `{fieldId, id, label}` adds an option at the end of a choice field.
  - **`field.renameOption`** `{fieldId, optionId, label}`, with `base.label`, relabels it, keeping its selections.
  - **`field.removeOption`** `{fieldId, optionId, scopeHash?}` removes an option. An option no album chooses goes at once.
    - **A chosen option** needs `scopeHash` from `GET /v1/fields/{fieldId}/options/{optionId}/removal`. That read gives the albums choosing it, active and in Trash, for the confirmation. Without the hash, or once the albums changed, the removal is `field_in_use`.
    - **Removal clears the option** from every album that chose it, sending each one's value as a `fieldValue` change. A single choice becomes null, and a multiple choice keeps its other options, or becomes null with none left.
  - **Already done:** a removed option removed again, and an option added again with its ID and label, change nothing.
- **Usage for Settings:** `GET /v1/fields/usage` gives each field's albums, active and in Trash, even empty: `{fields: [{fieldId, albums, inTrash}]}` (TON-53).
- **Deleting a field** (FR-03.18), permanently (TON-52):
  - **`field.delete`** `{id, scopeHash}` deletes the field with its options and every album's usage and value, in Trash too.
  - **It is always confirmed:** `scopeHash` comes from `GET /v1/fields/{fieldId}/deletion`. That read gives the field's type and options and the albums applying it, active and in Trash.
  - **Its scope** covers the name, type, options and those albums. A change to any of them makes the hash stale: `field_in_use`, "'Mood' changed since you confirmed. Review the deletion and confirm again."
  - **What it sends:** the `field` delete, and a `fieldValue` delete for each album that applied it.
  - **Already done:** a field already deleted changes nothing. Someone else's field is `not_found`.
- **Custom fields on albums** (FR-03.7, FR-03.8, FR-03.10), one record per album and applied field (TON-50):
  - **`fieldValue.apply`** `{albumId, fieldId}` applies a field, empty; **`fieldValue.remove`** takes it off with its value. Both are no-ops when already done.
  - **`fieldValue.set`** `{albumId, fieldId, value}`, with `base.value`, sets or clears the value of an applied field. A field not applied is `not_found`.
  - **`value` by type:** text (at most 2,000 characters), a decimal string, a `YYYY-MM-DD` calendar date, a boolean, an option ID, or option IDs without repeats. Anything else is `validation_failed` with its reason.
- **Links** (FR-06.2, FR-06.3), one per album and service (TON-46):
  - **`link.set`** `{albumId, service, url}` adds or replaces the album's link for `service`. `url` is the link as pasted; the server reads it as capture does (TS-40), following a short link, and stores the canonical URL. `base.url` is the URL the client last saw, or `null` for none.
  - **`link.remove`** `{albumId, service}` removes it; `base.url` is the URL the client last saw.
  - **A changed link** is a conflict on the field `url`. Another service's link, or text that isn't a supported album or track link, fails with `unsupported_link` and its reason.
- **Personal preferences follow the same rules** (FR-09.4).
  - **`view.set`** remembers or clears a person's choices for one view: `sortMode` with `sortDir`, `grouped` and `layout`.
    - A field left out stays as it is, and `null` clears it back to the account default. Its `base` is `null` for a choice not made.
    - The sort's mode and direction go together.
    - Folders and the root take `name`, `created` or `manual` and no grouping or layout; lists and Unsorted take `year`, `name` or `manual`.
    - Clearing every field deletes the view's record: the change's `data` is `null`.
    - **Shared content** (TON-69, FR-07.17): the view may also be a folder or list the person reads through sharing. The record is still the person's own, in their change log, and the owner's view is never read or changed. Anything else is `not_found`.
  - **`defaults.set`** changes some of the account defaults. Its `base` holds their prior values, DS-44's until saved.
  - **`defaults.setLinkTarget`** `{linkTarget}`, with `base.linkTarget`, sets where service links open: `web`, the canonical page, or `app`, the service's app (FR-06.6, TON-104).
  - **`defaults.setHiddenServices`** `{hiddenServices}`, with `base.hiddenServices`, sets the streaming services the person turned off, kept in the services' order (FR-06.3, TON-138).
  - Each of the three sends the whole `defaults` record.
- **Manual order** (TS-16) is a fractional-index key per arranged item, in each of the person's views. Keys compare bytewise. Items without a key follow the arranged ones in the view's fallback order (DS-44).
  - **`order.set`** places items in one view as one move. `args.keys` maps each item's ID to its new key, or `null` to clear its place; `base` maps each to its key before, `null` for none.
    - Each item must be in the view now.
    - A stale base is a conflict per item, whose `field` is the item's ID. Moves of different items both apply.
    - As with `view.set`, the view may be shared content the person reads: the keys are theirs alone (TON-69).
  - **The server places new items** (DS-51). Expect `position` changes from other mutations:
    - an album entering Unsorted (leaving its last list, or new once Unsorted is arranged) gets a key at its top;
    - an album joining a list loses its Unsorted key;
    - an album leaving a list loses its key there;
    - a moved folder or list loses its key in its old parent.

The answer is `200` with a `MutationResult`: `{mutationId, outcome}`. A malformed envelope answers `422` with a problem and changes nothing.

### Outcomes

`outcome.status` is one of (TS-27):

- **`confirmed`:** saved at `seq`. Its changes arrive on the stream at `seq`. Show the write as saved once the client has applied changes up to `seq`, not when the answer arrives. For an editor's write to a share, `seq` is a position in the owner's collection instead (see [Editors](#editors)). `result` carries what some mutations report, such as `membership.add`'s `{alreadyInList}`.
- **`failed`:** rejected, and nothing changed (X-05). It has a `code` and an RFC 9457 `problem`. Roll back, and keep the person's input.
- **`conflict`:** a `base` no longer matched. `conflicts` lists each field's `current`, `attempted` and `base` values. Keep the attempt for review (FR-09.4).
- **`needs_input`, `needs_approval`:** the write waits for a choice or an owner's approval (TS-26, TS-64).
- **`skipped`:** a batch item whose prerequisite wasn't confirmed (below).

The server stores the outcome of every write it runs, so sending the same `mutationId` again returns that outcome without applying the write twice. Copies that arrive together wait for each other.

### Batches

`POST /v1/batches` with `{batchId, items}`: 1 to 200 `BatchItem`s, each a mutation envelope plus an optional `dependsOn` naming earlier items' `mutationId`s (TS-25).

- **Order.** Items run in order, each on its own. A success stays saved whatever happens to later items, and its changes reach the stream as soon as it saves.
- **Dependencies.** An item runs only if each item it depends on is `confirmed`. Otherwise it is `skipped`, with `dependsOn` naming the first prerequisite that wasn't and `because` giving that prerequisite's status.
- **Validation.** Each item is validated on its own: an invalid one fails with `validation_failed`, and the rest run. The batch is refused as a whole, with `422`, only when it has no items, more than 200, or a missing or repeated `mutationId`.
- **The answer** is `200` with `{batchId, items: [{mutationId, outcome}]}`, in the order sent.
- **Resending.** Skipped and invalid items aren't stored. Sending the same batch again replays what ran and judges the rest again.

### Unanswered writes

A network error, a timeout, a `5xx`, a `408` or a `429` leaves the outcome unknown: the write is *unconfirmed* (FR-13.3). Never show it as saved, nor as failed. To reconcile it:

- **send the same envelope again**, which is safe by `mutationId`; or
- **look it up** with `GET /v1/mutations/{mutationId}`. It answers the stored `MutationResult`, or `404` if the server never received the write.

A capture still running answers `409 in_progress`, both to its envelope sent again and to the lookup (TS-22). Look it up again a little later. A batch that holds such an item answers `409 in_progress` as a whole; the items before it are saved, and sending the batch again replays them.

A write whose `mutationId` is more than 30 days old and has no record is `failed` with `expired`, never run (TS-22). Any other `4xx` with a problem means the request was judged and nothing changed.

### Sending writes

- **One at a time, in order.** Send from an outbox: the next write only after the previous one has an answer. That keeps causality, such as creating a list and then adding to it.
- **Persist the outbox**, so a restart can still reconcile unconfirmed writes.
- **Several writes at once,** for one user action, go in a batch.

## Editors

An owner may let chosen people edit a shared folder or list (FR-07.18 to FR-07.21, TS-20, TS-24, TS-30). What an editor changes there stays in the owner's collection.

- **Roles.** Each invitation is `view` or `edit`: `share.invite`'s `role`, changed with `share.setRole`. Links only ever give `view`. Through folders, the higher role wins. A client learns the person's role from two reads:
  - `GET /v1/shared`: each entry's `role`, null while it can't be opened;
  - `GET /v1/shared/{id}`: `role` on the root.
- **Holding a share.** An editor's client keeps the share as a collection of its own, apart from the person's:
  - it reads `GET /v1/shared/{id}`: the share's folders and lists, entries, albums, links and field values, plus all the owner's fields with all their options;
  - it reads again after each `shared-invalidate` on `GET /v1/shared/{id}/stream`;
  - a read whose `role` is `view`, or a `404`, means the person can no longer edit it.

  The person's own bootstrap and stream never carry the share's content, only its `reference`.
- **Writes** use the same envelope, endpoints, outcomes and outbox rules as the owner's.
  - **What an editor changes:** folders, lists and albums inside the share, and the albums' links and field values. New albums and captures name a list in the share as `listId`; `album.create` takes an optional `listId` for that. The shared folder or list itself can be renamed, described and colored.
  - **What stays the owner's:** field definitions, sharing, Trash purges, and moving or deleting the shared folder or list itself.
  - **The person's own:** views, defaults and manual order of the share stay in the person's own change log (FR-07.17).
- **Where the changes go.** An editor's write runs under the owner's write lock. Its changes go into the owner's change log, at the owner's `seq`, with the editor's `mutationId`. So they reach the owner's stream, and every reader of the share gets `shared-invalidate`.
  - The stored outcome stays the editor's, so a retry and `GET /v1/mutations/{mutationId}` work as for any write.
  - A batch may mix the person's collection and shares: each item runs under the lock of the collection it changes.
- **Confirming.** An editor's `confirmed` outcome carries a position in the owner's collection, not the owner's `seq`.
  - The position counts the owner's writes, one per write however many changes it made (TON-198).
  - An editor's `GET /v1/shared/{id}` carries the same count as `seq`. Viewers and guests get 0.
  - Show the write as saved once a read of the share reaches the outcome's `seq`. How far the count moves says nothing of how much a write changed.
- **Refusals.**
  - A folder, list or album the person can only view: `permission_denied`, "You can view this…, but not change it."
  - Moving or deleting the shared folder or list itself: `permission_denied`.
  - Anything they can't read: `not_found`, as for a record that doesn't exist.
- **Albums.**
  - **`album.delete`** takes the album out of the lists the editor edits. It goes to Trash only when no other list of the owner's holds it. Otherwise no unit is made, but `unitId` is spent: using it again is refused either way.
  - **`album.capture`** never matches an album in the owner's Trash; it saves a new one. A capture that reuses an album the editor can't see reports `created`.
- **Trash.** An editor sees nothing of the owner's Trash. Outside MCP, `trash.recover` with the `unitId` of their own folder or list deletion brings it back where it was, while they can still edit there. With a `parentId`, or once they can no longer edit there, it is `permission_denied`. Every other unit of the owner's is `not_found`.
- **Limits.** An editor's captures count against the editor's hourly limit. The album, folder, list and entry limits are the owner's (TS-18).

## The client, step by step

1. **Bootstrap**, unless the client kept a cursor. Replace every store with the snapshot, and set the cursor to its `seq`.
2. **Stream from the cursor.** Apply each `change` to its entity's store by key, in order, and advance the cursor.
3. **On `reset`**, go back to step 1.
4. **When the stream ends,** reconnect from the cursor, at once or with backoff as above. On `401`, sign out.
5. **Write optimistically.** Show the edit at once, marked pending, and enqueue the mutation.
   - On `confirmed`, keep it pending until the cursor reaches the outcome's `seq`, then show it as saved.
   - On `failed` or `conflict`, roll back and report.
   - Without an answer, mark it unconfirmed and reconcile as above.

## Limits and errors

- **Size limits:** 200 items per batch, plus the resource limits in TS-18, each refused with `limit_exceeded` or `capacity_exceeded`.
- **Kept history:** change history and stored outcomes for 30 days, pruned daily (TS-91).
- **Errors** are `application/problem+json` with a TS-27 `code` (TS-09). Clients must accept codes, statuses, entities, `because` values and response fields added within v1.
- **Compression:** JSON responses of 1 KB or more are gzipped for clients that send `Accept-Encoding: gzip`. The stream never is.
