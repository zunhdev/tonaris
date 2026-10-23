# Design

## Context

- **The views** (TON-34, `apps/web/src/features/collection`) order albums with `chronological()` in `order.ts`, DS-44's first-time default, and folders and lists in creation order, as `buildTree()` does for the tree. Rows and cards show `yearLabel()`.
- **The layout** is a Rows | Grid switch in the header (`layout-switch.tsx`), kept per view on the device under `tonaris:layouts:<accountId>` (`features/shell/device.ts`).
- **The database already has `view_prefs`** (TS-11): `person_id`, `view_key` (`root`, `unsorted` or a container ID), and nullable `sort_mode`, `sort_dir`, `grouped` and `layout`, where null follows the account default. TS-11 puts the account defaults in `account_settings`, which doesn't exist yet. `change_log.entity_id` is text so that preference changes can be keyed by view keys.
- **Writes are domain commands** (TS-20) in `packages/domain`, run by `executeMutation` under the owner's write lock. They reach clients through the change log, the stream and the bootstrap (TS-23, TS-24). On the web, TanStack DB collections write optimistically through the outbox (`client/sync`). Retries, dependencies, descriptions and the conflict review each know every mutation name.
- **FR-09.4's conflict policy covers personal preferences too.** "There is no silent last-write-wins", so preference writes carry `base` like any other (TS-21).
- **Base UI 1.9** has `RadioGroup` and `Radio`. The UI package has no segmented control yet.
- **The creator's decisions:**
  - TON-34's notes: the layout switch moves into View options;
  - 23 October 2026: the sidebar tree follows each level's sort.

## Goals / Non-Goals

**Goals:**
- **Every sort and grouping,** combined independently, in both layouts, still smooth at 5,000 albums.
- **One person's choices** on all their devices, through the existing sync protocol, under the same conflict rules as content.
- **Shapes TON-36 and M7 extend without change:** manual order reads positions where this change reads the fallbacks, and shared views use the same preferences keyed by the shared container's ID.

**Non-Goals:**
- **Rearranging and positions** (TON-36). Manual order shows DS-44's fallbacks.
- **Shared and guest views** (M7). That includes FR-11.9's per-visit choices for guests, and AC-16's shared and guest checks.
- **Editing mode** (TON-37).
- **Correcting an album's classification** (FR-05.9's last point; the inspector, TON-38).
- **The MCP `set_view_preferences` tool** (M9). It will send the same `view.set` command.
- **The rest of Settings:** Profile, Account, Custom fields and Data (M4, M8, M10).

## Decisions

### 1. Preferences in the domain

`packages/domain/src/views.ts` holds the vocabulary and the commands:

- **The vocabulary:**
  - `listSortModes`: `year`, `name`, `manual`;
  - `folderSortModes`: `name`, `created`, `manual`;
  - `sortDirections`: `asc`, `desc`;
  - `viewLayouts`: `rows`, `grid`.
- **A view key** is `root`, `unsorted`, or a folder's or list's ID. The root and folders take folder sorts; Unsorted and lists take list sorts.
- **`ViewPrefs`:** `{ viewKey, sortMode, sortDir, grouped, layout }`.
  - Each field is nullable: null follows the account default.
  - `sortMode` and `sortDir` are set and cleared together: the sort is one choice.
  - `grouped` and `layout` stay null for folders and the root.
- **`ViewDefaults`:** `{ listSortMode, listSortDir, folderSortMode, folderSortDir, grouped, layout }`, always complete.
  - `appViewDefaults` is DS-44's first-time default: `year`, `asc`, `manual`, `asc`, `false`, `rows`.
  - The folders' direction is part of the defaults: DS-94 names only a folder sort, but Name and Created have directions too.

**`view.set`** (`args: { viewKey, sortMode?, sortDir?, grouped?, layout? }`, `base`):
- **Fields:** a field left out is untouched. Null clears a choice back to the default.
- **`base`** holds exactly the changed fields' prior values, with null for unset, as `album.update` does (TS-21). A mismatch is a `conflict` with `{field, current, attempted, base}`.
- **The sort is one change.** `sortMode` and `sortDir` must come together.
- **Checked against the view:** the sort mode must suit the view's kind, and folders and the root take no grouping or layout.
- **A container's view** must be of the person's own folder or list, in Trash or not. Otherwise it is `not_found`, with the same answer for a missing one and someone else's (M7 adds shared containers). A choice for a list in Trash is harmless, and refusing it would fail a choice queued while offline.
- **The result:**
  - all four fields null deletes the row;
  - otherwise the row is upserted;
  - the change is `entity: "view"`, keyed by the view key, with the record, or null when deleted;
  - the same values change nothing.

**`defaults.set`** (`args`: some of `ViewDefaults`'s fields, `base`):
- **Rules:** CAS as above, against the stored defaults or `appViewDefaults`.
- **The result:** the row is upserted, and the change is `entity: "defaults"`, keyed by the account ID, with the complete defaults.

**Both are `collection`-scope writes** under `authorizeWrite`, whose scope already covers "content and personal preferences". Neither is X-03 app-only, so MCP in Manage mode may make them later.

*Alternative:* last write wins for preferences. FR-09.4 rules that out.

*Alternative:* one mutation per field. A sort's mode and direction belong together, and "Use account defaults" clears every field in one change.

### 2. Storage and the protocol

- **Migration** (`db:generate`):
  - **A new `account_settings` table:**
    - `account_id` is the primary key, referencing `user` with NO ACTION, like owner columns (TS-74);
    - the six default columns are NOT NULL, each with a CHECK.
    - No row means `appViewDefaults`. The command writes a complete row.
  - **Two new CHECKs on `view_prefs`:**
    - `view_prefs_sort_mode_check`: the sort mode is one of the four;
    - `view_prefs_sort_check`: `(sort_mode is null) = (sort_dir is null)`.
- **The store** gains these methods, on the owner's write transaction:
  - `findViewPrefs`;
  - `saveViewPrefs` (an upsert);
  - `deleteViewPrefs`;
  - `findDefaults`;
  - `saveDefaults` (an upsert).
- **The bootstrap** gains `views`, the person's rows, and `defaults`, complete. Both come from the same repeatable-read snapshot.
- **`changeSchema`** gains `view`, with the view key as its ID, and `defaults`. The `/v1` changes are additive.
- **Docs:**
  - `docs/api/sync-protocol.md` lists the new envelopes and changes;
  - TS-11 lists `account_settings`;
  - the OpenAPI document is regenerated.

### 3. The client's collections

- **Two collections.** `client/sync/views.ts` adds `views`, keyed by view key, and `defaults`, one row keyed `defaults`. Both use the snapshot collection that `lists.ts` uses, moved to `client/sync/snapshot.ts`.
- **How collection calls become writes:**
  - an insert sends `view.set` with the fields set, from null bases;
  - an update sends the changed fields, from the original's values;
  - a delete sends every set field as null.
- **Save-state keys** are `view:<viewKey>` and `defaults`. A container's view preferences then never mark the container's own row.
- **Retries:** `resubmit.ts` makes `view.set` and `defaults.set` again against the current row, as an insert, update or delete.
- **Dependencies:** `dependencies.ts` makes a choice for a list depend on that list's creation in the same batch.
- **Descriptions:** `describe.ts` names them "View options for 'Doom'" and "Default view options". The conflict review labels their fields (Sort, Direction, Grouping, Layout) and values ("Account default" for null).

### 4. The presentation a view shows

`features/collection/presentation.ts` is pure, and tested:

- **`presentationOf(kind, prefs, defaults)`** gives a view's effective sort, direction, grouping and layout.
  - The sort and direction come from the view's row when its sort is set; otherwise from the kind's defaults.
  - Grouping and layout come from the row if set, else from the defaults.
  - Folders and the root are always combined, in Rows.
- **`CollectionData`** gains the `views` map and the `defaults`, from the same `useLiveQuery` pass as the rest. Before the first snapshot it uses `appViewDefaults`.
- **`usePresentation(viewKey, kind)`** gives the presentation, whether the view has remembered choices, and the actions:
  - `choose(change)`: inserts or updates the row;
  - `useDefaults()`: deletes the row;
  - `saveAsDefault()`: updates the defaults row with the view's effective choices for its kind.

  Writes don't wait for their outcome. The save-state layer reports a failure, as for any write. Presentation choices aren't collection edits (X-04), so they work offline: they wait in the outbox.

### 5. Order and grouping

`features/collection/order.ts` grows, still pure and tested:

- **`sortAlbums(albums, sort, manual)`:**
  - **Year:** `sortYear`, FR-05.5's chronological year. Unknown years come last in both directions.
  - **Name:** by `searchKey(title)`, then the artist's `searchKey`.
  - **Ties:** ascending by title, then by ID, in both directions, so the order is total.
  - **Manual:** returns `manual`, the order the view supplies until TON-36:
    - a list's entries by `addedAt`, then album ID;
    - Unsorted's albums newest first, by UUIDv7 ID, descending (DS-51's inbox).
- **`sortContainers(containers, sort)`:**
  - **Name and Created:** folders first, then lists, each by `searchKey(name)` or by UUIDv7 ID, the creation time (TS-10).
  - **Manual:** creation order.
- **`groupOf(album)`** applies FR-05.9:
  - live comes first, whatever the type;
  - then `album`, `ep` and `compilation`;
  - null, which includes singles (TS-45), is Unclassified.
- **`groupSequence`** is DS-43's: Album, EP, Live, Compilation, Unclassified.
- **`sections(sorted, grouped)`** splits the sorted albums into the non-empty groups, in sequence, each keeping the sorted order. Combined, it is one section without a header. Grouping filters the one sorted sequence, so FR-05.8 holds by construction: the manual order is the same arrangement, grouped or not.
- **`chronology(album)`** gives DS-24's display:
  - the year text;
  - whether it is a recording year, for the `rec.` prefix;
  - whether it is the release-year fallback.

  `yearLabel()` stays for plain text.

**The tree follows the views** (the creator's decision). `buildTree(containers, order)` takes the ordering of each level: `CollectionData` passes `sortContainers` with that folder's presentation, and the root's for the top level. The tree and the view beside it always agree.

### 6. Group headers under virtualization

- **The virtual items.** Album rows and cards take their sections and the collapsed groups, and build one list of virtual items:
  - **Rows:** a header, then each album row.
  - **Cards:** a header, then the section's albums cut into rows of `columns`.
  - Sizes are exact: a 28 px header, a 36 px row, and a card row as before.
  - A collapsed group keeps only its header.
- **Assistive technology:**
  - each header is a grid row, with one cell spanning the columns (`aria-colspan`);
  - the cell holds a button with the group's name and count, and `aria-expanded`;
  - `aria-rowcount` counts the headers.
  - The grid's shape gives a header row one column, so ↑ and ↓ pass through headers, and Enter or Space on the button toggles the group.
- **Sticky headers.** The section header in view stays at the top, following TanStack Virtual's sticky pattern:
  - a `rangeExtractor` keeps the current section's header rendered;
  - that header is `position: sticky` at the top, with the raised surface behind it;
  - the others stay absolutely positioned.
- **Collapsed groups** are kept per view in `sessionStorage` (`tonaris:collapsed:<accountId>:<viewKey>`), so a reload in the tab keeps them, and they aren't synced (DS-43). As for `localStorage`, storage that fails is ignored.
- **While grouped,** the album rows drop the release-type column (DS-21).

### 7. The year display

A small `ChronologyYear` component shows DS-24's three cases in rows and cards:
- **Non-live:** the year.
- **Recorded:** `rec.` in `text-small` and `fg.tertiary`, then the year or the full range.
- **Fallback:** the release year, a `·`, and a `CalendarClock` glyph.
  - A tooltip on the glyph says "Recording year unknown — sorted by release year".
  - Visually hidden text says the same for assistive technology, because a tooltip never carries information alone (DS-115).

### 8. View options

`features/collection/view-options.tsx`:

- **The View button** sits at the header's end, with `aria-keyshortcuts="V"`, in every collection view: the root, folders, lists and Unsorted. It replaces TON-34's layout switch, and `layout-switch.tsx` goes.
- **The popover** (DS-49):
  - **Sort:** Year / Name / Manual for lists and Unsorted, and Name / Created / Manual for folders and the root.
  - **Direction:** Ascending / Descending, disabled while Manual is chosen.
  - **Grouping:** None / Release type, for lists and Unsorted.
  - **Layout:** Rows / Grid, for lists and Unsorted.
  - **Footer:**
    - "Use account defaults", disabled when the view has no remembered choice;
    - "Save as my default", disabled when the view's choices already are the defaults.
- **Each choice is a segmented control,** a new `SegmentedControl` in `packages/ui` on Base UI's `RadioGroup`. It is a radio group, with arrow keys between options.
- **`V`** joins the shortcut matcher as `view-options`. The view's popover registers its opener in the collection UI context, which the shortcuts call. The reference lists `V`.
- **The device's layouts seed the account once.** When the collections first load, every view kept as Grid in `tonaris:layouts:<accountId>` gets `layout: grid`, if that view still exists and has no layout of its own. Then the device key is removed. A second tab doing the same meanwhile writes the same value, which changes nothing.

### 9. Settings → Preferences

- **The page.** `routes/_workspace/settings.preferences.tsx` shows the defaults as segmented controls:
  - **Lists and Unsorted:** sort, direction, grouping and layout;
  - **Folders and Collection:** sort and direction.

  Each choice writes `defaults.set` at once. A note says that folders, lists and views with their own choices keep them when the defaults change (DS-94).
- **The subnav.** A `SettingsNav` under each settings page's header lists Preferences and Connections, in DS-92's order, with `aria-current="page"` on the current one. Profile, Account, Custom fields and Data join with their issues.
- **The way in:**
  - the account menu's "Connections" item becomes "Settings" and opens Preferences;
  - G then S goes to Preferences.

### 10. Folder rows

When a folder or the root is sorted by Created, the rows show a third column, "Created". It holds the creation date from the container's UUIDv7 ID (`uuidv7Time`), in the browser's medium date style (DS-41).

## Risks / Trade-offs

- **[Manual order before TON-36 can't be rearranged]** → Manual is still offered, so the choice exists and is remembered. TON-36 makes the fallbacks into positions without changing the choice.
- **[Unsorted's manual fallback is by when the album was made, not when it entered Unsorted]** → An album leaving its last list doesn't jump to the top until TON-36 writes positions (DS-51). This is acceptable for one issue, and stated in the PR.
- **[The creation date comes from the client's clock]** → IDs are made where the container was created (TS-10), so a wrong clock shows a wrong date. It is the same order the tree already uses, and nothing else depends on it.
- **[A sticky header in a virtualized grid]** → The current header stays rendered through the `rangeExtractor`, so it never unmounts while stuck. Its focus and `aria-rowindex` are its own.
- **[Conflicts on preferences are rare and minor]** → They still use the general review, so nothing is lost silently (FR-09.4). The review names the fields in words.

## Migration Plan

- **The database:** one additive migration, applied by the pre-deploy step (TS-17). No backfill: no rows means the defaults.
- **The device's layouts** are moved to the account by the client on first load, then removed from the device.
- **Mixed versions:** the old web app ignores the new bootstrap fields, because Zod strips unknown keys. It can't parse a `view` or `defaults` change, though, so an old tab that meets one on its stream reconnects until reloaded. Only the new web app makes those changes, and the web app and the API deploy together.
- **Rollback:** the old API refuses `view.set` and `defaults.set` as unknown mutations, which the client reports as failed writes. The tables can stay.

## Open Questions

None.
