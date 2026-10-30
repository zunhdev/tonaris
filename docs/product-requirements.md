# Tonaris — Product requirements

| | |
| --- | --- |
| Status | Working baseline, iteration 6 |
| Updated | 21 October 2026 |
| Companion documents | [Design spec](design-spec.md) · [Tech spec](tech-spec.md) · [Audits](audits/) |
| Change history | [Section 11](#11-change-log) |

This document is the source of truth for Tonaris's purpose, scope, user-visible behavior, permissions, quality expectations, and acceptance checks. Technologies, data representation, APIs, layouts, and visual design belong to the [design spec](design-spec.md) (`DS-` IDs) and [tech spec](tech-spec.md) (`TS-` IDs).

## How to read this document

**Normative status.** Every numbered rule is **required** for the first version unless it is marked:

- **Open**: unresolved feasibility. Implementation must not silently assume an outcome (see [section 8](#8-feasibility-gates-and-risks)).
- **Pending approval**: needs a creator-approved value (budget, target, objective) before first-version acceptance (see [section 9](#9-open-decisions-and-pending-approvals)).

**IDs.** Each ID is stable. It is never renumbered or reused, and retired IDs are listed in the change log.

| Prefix | Meaning | Example |
| --- | --- | --- |
| `FR-NN` | Functional area | FR-07 Read-only sharing |
| `FR-NN.M` | Individual functional rule, the unit referenced by design, tech, Linear, and OpenSpec work | FR-07.9 Sharing on moves |
| `X-NN` | Cross-cutting rule that applies to every FR | X-05 Rejections change nothing |
| `Q-NN` | Quality requirement | Q-04 Service disaster recovery |
| `AC-NN` | Representative acceptance check | AC-30 Delete, recover, re-add albums |
| `D1`–`D8`, `G1`–`G3` | Decision areas and feasibility gates | G2 Album matching |

**Brevity convention.** Cross-cutting rules (section 4) are stated once and are not repeated in each FR. A rule mentions the design or tech spec only when it hands over a specific decision.

## 1. Purpose and users

**Audience.** The creator, who needs Tonaris for personal use. Other album collectors may join by invitation, within affordable operating limits.

**Product statement.** A personal workspace for saving, organizing, annotating, and revisiting music albums across streaming services, with selective sharing, AI-assisted collection management, and full ownership of your data.

**Rationale.** Tonaris is primarily a personal tool with no initial commercial proposition. The creator's need is reason enough to build it. Market demand, differentiation, and adoption targets are not prerequisites.

**Success.** Tonaris meets the creator's collection-management needs reliably, and operation stays affordable as invited users join.

**User outcomes.**

1. Save albums without manually transcribing their basic metadata.
2. Organize and find albums as the collection grows.
3. Add personal context using optional custom fields alongside editable album metadata.
4. Open an album in a chosen streaming service when a link is available.
5. Share selected collections without exposing unrelated private content.
6. Delegate collection organization to an authorized AI agent while retaining control.
7. Own your data: download the whole collection in a structured file that people and AI tools can read.

## 2. Scope

### 2.1 First-version capabilities

| Capability | Requirements |
| --- | --- |
| Lists, nested folders, Unsorted, 30-day Trash | FR-01, FR-14 |
| Link capture from Spotify, Apple Music, Qobuz, and Tidal with metadata enrichment; manual entry | FR-02 |
| Editable metadata, chronology, optional custom fields | FR-03 |
| Viewing and editing modes; sorting, manual order, release-type grouping | FR-04, FR-05 |
| Streaming-service links that open the external app | FR-06 |
| Read-only sharing by account invitation and guest-viewable link | FR-07 |
| Data export | FR-08 |
| Automatic synchronization with conflict protection | FR-09 |
| MCP access for Claude web, ChatGPT web, and Codex desktop | FR-10 |
| Passwordless authentication, settings, invite-only admission | FR-11 |
| Global quick search | FR-12 |
| Errors, outcomes, and recovery | FR-13 |
| Capacity and resource limits | FR-15 |

The substantial first-version scope is accepted. Work is delivered in increments without removing first-version capabilities.

### 2.2 Devices and browsers

- **Desktop web** supports every workflow, including collection editing, account settings, sharing management, and creator administration.
- **Mobile web** supports browsing:
  - viewing owned and currently shared content, and navigating folders, lists, and Unsorted;
  - global search when signed in;
  - choosing sort mode, direction, and grouping (FR-05.2). Saved manual order is shown, but rearranging is desktop-only;
  - opening an explicitly selected service link;
  - signing in and out.

  Guests can view valid shared links. Collection-content edits are desktop-only in the browser (X-04). Mobile coverage of account and sharing administration is not required.
- **Supported browsers.** Desktop: Chrome, Edge, Firefox, and Safari. Mobile: Safari on iOS and Chrome on Android. Exact versions and the OS test matrix are in the tech spec.
- **Later platforms.** Native iOS and Android apps are planned for a later phase, and desktop apps for a more distant one. They are not specified here. Native apps will use the same service API as the web app (tech spec).

### 2.3 Connectivity and language

- **Online only.** Normal use requires an internet connection. Offline browsing, search, and editing are out of scope.
  - Report connection failures and preserve input (FR-13).
  - Distinguish pending or unconfirmed saves from confirmed saved state (FR-09.3).
  - After reconnecting, reconcile interrupted operations against saved state before retrying, without duplicates or overwriting newer edits (FR-13.5).
  - Previously loaded content may stay visible with a clear connection status. This is not a promise of offline use or current data.
- **English-only interface**, including guest views and app-generated messages. Saved content may be in any language and keeps its original spelling and characters. Translations and a language selector are deferred.

### 2.4 Hosting and admission

- Tonaris is a creator-hosted, invite-only service. Independent installations by other people, including self-hosting instructions and support, are out of scope. Developer setup and service portability remain required (Q-08, Q-09).
- Registration has no country restriction. Provider and release availability still varies by region (G1).
- There is no fixed total-account cap. The creator controls growth through admission invitations and by pausing admissions (FR-11.6). Admitted users keep access while admissions are paused.
- Collection sharing never grants admission: sharing invitations and guest links do not create accounts (FR-07.4, FR-11.2).

### 2.5 Services and collection scope

- **Launch services:** Spotify, Apple Music, Qobuz, Tidal (added 20 October 2026). Tonaris accepts links supplied by users or MCP clients. It resolves them, retrieves available metadata, matches them to saved albums, and opens saved links. People and client agents find links themselves; built-in catalog search and link discovery are out of scope (FR-06.7). Permitted use was reviewed for Spotify, Apple Music and Qobuz on 19 October 2026, and for Tidal on 20 October 2026. The access paths were decided on 21 October 2026 (G1).
- **Independent collection.** Tonaris does not synchronize with streaming-service saved-album libraries in either direction. Saved Tonaris data still synchronizes across the user's devices (FR-09).
- **Albums, not tracks.** Collection items are album/release records, including EPs, live albums, and compilations. Tracks are not collection items, and a track link resolves to its parent release (FR-02.3). The app and MCP use the same item scope.

### 2.6 First-version exclusions

| Excluded | Notes |
| --- | --- |
| In-app playback, audio hosting, music downloads | Playback happens in the selected service (FR-06.1). |
| Synchronization with streaming libraries | Either direction. |
| Track items and track-level playlists | Track links resolve to their parent release. |
| Public discovery feeds, follows, comments, public profiles, user discovery | Sharing is selective (FR-07). |
| Collaborative editing by other users | Sharing is read-only. |
| Built-in recommendations | External agents keep the ordinary MCP read and search abilities. The MCP server adds no recommendation feature. |
| Automatic listening-history tracking | Custom fields may hold manually or agent-entered listening information (FR-03.20). |
| Importing or restoring exports, and merging backups | **Not planned.** Export exists so users own their data (FR-08). |
| Exporting other owners' shared content (viewer exports) | Not planned. |
| Full metadata edit history | Current values only (FR-03.2). |
| User-configurable custom-field constraints | Basic type validation only (FR-03.10). |
| Preferred-service setting | Service choice is explicit each time (FR-06.5). |
| Search within guest shares; typo-tolerant search | Global search requires sign-in (FR-12.1). |
| Per-folder or per-list MCP connection scopes | Connections cover the whole collection (FR-10.2). |
| Collection editing in mobile browsers | Section 2.2. |
| Password sign-in and provider-based sign-in | Provider sign-in may be added later (FR-11.12). |
| Offline use; interface translations | Section 2.3. |
| Supported independent installations | Section 2.4. |

## 3. Concepts

These are user-facing concepts, not a data model.

| Concept | Meaning |
| --- | --- |
| Collection | A user's owned folders, lists, albums, and custom fields. |
| Collection root | The top level of a collection. It holds folders and lists but cannot itself be shared. |
| Folder | A named container for lists and other folders. |
| List | A named collection of albums. Each person chooses their own viewing order. |
| List entry (membership) | An album's presence in a particular list. One album can be in many lists. |
| Unsorted | An automatic view of the owner's saved albums that belong to no list. |
| Trash | An owner-only recovery area for deleted albums, lists, and folder hierarchies. Items stay there for 30 days. |
| Album | A saved album record (album, EP, live album, compilation). There is one record per album, whichever edition its links point to (FR-02.12). |
| Edition | A version of an album, for example "2010 remaster" or "2022 deluxe". This version doesn't distinguish editions: a link to any edition belongs to the album (FR-02.12). |
| Album chronology | The year used for chronological sorting (FR-05.5). It is never a reissue's release year. |
| Release-type group | A presentation group: Album, EP, Live, Compilation, or Unclassified (FR-05.9). |
| Service link | A link to a particular release on a streaming service. |
| Custom field | An account-level field definition that albums can optionally use. Values belong to the album. |
| Owner | The user who controls a collection and grants access. |
| Viewer | A person allowed to read shared content: a signed-in account or a guest with a link. |
| Shared with me | A signed-in viewer's saved references to collections shared with them. |
| Authorized agent | An AI agent connected through MCP. It never exceeds the user's permissions. |
| Export | A downloadable archive of the owner's collection (FR-08). |

## 4. Cross-cutting rules

These rules apply to every functional requirement unless an FR explicitly states an exception.

**X-01 Ownership.** Each collection initially has one owner. Users change only their own collection and their own personal preferences. Edits never change another user's data or a provider's catalog. Viewer and agent access never exceeds the authorizing user's ownership and sharing access.

**X-02 Channel parity.** Collection rules apply identically to the app, link capture, and MCP. These include validation, required information, uniqueness, capacity, matching, enrichment, search scope and matching, sharing effects, Trash behavior, conflict handling, and outcome reporting. MCP adds the connection's permission mode (FR-10.3) and its approval rules (FR-10.6).

**X-03 App-only operations.** These run only through the app, never through MCP, regardless of permission mode or user approval:

- permanent Trash removal and clearing Trash;
- sharing management: invitations, account grants, link settings, and a recipient's accept, decline, or leave;
- account actions: display name, sign-in email, data export, account deletion, MCP connection management;
- creator admission administration.

MCP rejects these requests without changing anything and reports the restriction (FR-13).

**X-04 Device scope.** In the browser, collection-content edits are desktop-only. These include additions, metadata and field edits, membership changes, container creation, renaming, moves, and deletion, and Trash recovery and clearing. Personal presentation choices (FR-05.2) are not collection edits. Approving an agent's gated operation (FR-10.6) is not a browser collection edit and works on mobile. MCP is unaffected by browser device scope.

**X-05 Rejections change nothing.** An operation can be rejected for validation, uniqueness, capacity, permission, an invalid destination, a conflict, or missing approval. A rejected operation leaves saved state unchanged, reports the reason (FR-13), and preserves the input for correction or retry. Rejection never merges, overwrites, replaces, or automatically renames existing items.

**X-06 Name uniqueness.** Where a rule requires unique names:

- comparison is case-insensitive ("Favorites" and "favorites" collide);
- the chosen spelling is preserved for display;
- a case-only rename of the same item is allowed;
- blank names are invalid;
- permanently removed items, and containers in Trash, do not reserve names.

The rule applies to creation, renaming, moves, and recovery.

**X-07 Confirmed operations.** Before a *confirmed* operation runs, Tonaris identifies its exact target scope and consequences, including sharing effects and whether it can be undone. It proceeds only after explicit confirmation, and cancelling changes nothing. Through MCP, confirmation is the scoped approval in FR-10.6.

**X-08 Live propagation.** Every saved change reaches the user's other sessions and, within current sharing scope, authorized viewers (FR-09.1). Individual rules do not repeat this.

**X-09 Trash-inclusive field changes.** Account-wide custom-field changes (renames, option changes, removals, deletion) apply to trashed albums as well as active ones. Trash recovery never recreates removed definitions, removed options, or cleared values.

**X-10 Handoff.** Layout, controls, wording, and presentation are defined in the design spec. Mechanisms, data representation, algorithms, operational limit values, and verification methods are defined in the tech spec.

## 5. Functional requirements

### FR-01 — Lists, folders, Unsorted, and Trash

**FR-01.1 Hierarchy.** Users create lists and folders at the collection root or inside folders, and nest folders recursively like a filesystem. Nesting is not arbitrarily restricted to a few levels. Any practical depth limit is documented rather than promising infinity.

**FR-01.2 Sibling-name uniqueness.** Active folders and lists with the same parent, the root included, have unique names across both container types (X-06). The same name may be reused under different parents.

**FR-01.3 Rename, reorder, navigate.** Owners rename lists and folders and arrange them, using personal arrangement (FR-05.2). Users can always tell where they are and navigate the hierarchy.

**FR-01.4 Folder moves.** Owners move a folder to another active folder they own or to the root. The move takes the whole hierarchy and reuses it: descendant folders and lists, memberships, metadata, descriptions, and personal viewing settings. Nothing is copied. Moves into the folder itself or one of its descendants are rejected, as are inactive, foreign, or otherwise invalid destinations. Sharing effects follow FR-07.9.

**FR-01.5 List moves.** Owners move a list between active owned folders and the root. The list keeps its identity, description, memberships, direct sharing settings, and each person's viewing preferences and manual arrangement. Nothing is copied. Destination ownership, active status, and FR-01.2 are enforced. Inherited sharing follows FR-07.9.

**FR-01.6 Albums in many lists.** One saved album can appear in many lists of a collection. Every appearance shares the same metadata, service links, and custom-field usage and values, so an edit made from any list applies to all of them.

**FR-01.7 One entry per list.** Each saved album appears at most once in a list. Re-adding an album that is already present keeps its entry and position, reports that it is already in the list, and does not overwrite metadata or field values.

**FR-01.8 Album retention.** A saved album belongs to the collection independently of its memberships.

- Removing a membership keeps the album and its other memberships.
- Removing its last membership moves it to Unsorted.
- Deleting an album from the collection is a separate confirmed action (FR-14.1).

**FR-01.9 Unsorted.** Unsorted is an automatically maintained view of the owner's saved albums that have no list memberships. It keeps all their metadata, links, and field usage and values. Adding an Unsorted album to a list reuses the record and removes it from Unsorted. Unsorted is not a list and needs no manual maintenance. Presentation follows FR-05.4.

**FR-01.10 Container removal keeps albums.** Removing a list, directly or inside a deleted folder hierarchy, removes its active memberships but never the albums. Albums with other memberships stay in those lists, and the rest appear in Unsorted.

**FR-01.11 Deleting folders and lists.** Deleting a list or folder moves it to Trash. A folder takes all its nested folders and lists with it. Deleted containers disappear from active and shared views. Folder deletion is *confirmed* (X-07): the confirmation names the folder and the hierarchy going to Trash, and explains that albums remain in other lists or Unsorted. Feedback for deleting a single list is a design decision.

**FR-01.12 Trash.** Trash is an owner-only recovery area for deleted lists, folder hierarchies, and albums (FR-14). Trashed content is excluded from active views, sharing (FR-07.10), and ordinary search. Tonaris preserves the information needed to recover hierarchy and memberships, and shows each item's expiry date.

**FR-01.13 Trash units.** A folder and the active descendants deleted with it form one unit, with one deletion time and one expiry.

- Descendants cannot be recovered or purged individually. Tonaris identifies the containing unit and explains how to act on it.
- A list, folder, or album deleted separately is its own unit with its own expiry, even if its former parent is deleted later. Later deletion, recovery, or purge of the parent never absorbs, restores, removes, or re-dates it.
- Separately deleted content whose parent is unavailable follows FR-01.15.

**FR-01.14 Container recovery reuses active albums.** Recovering a list or folder restores memberships only for referenced albums that are currently active. Those albums keep their current metadata and values: nothing is duplicated and later edits are not reverted.

- Separately deleted albums stay in Trash with their own expiry.
- Missing albums are not recreated.
- Each skipped membership is reported with its reason, and recovery of everything else continues (FR-13.4).

**FR-01.15 Recovery destination.** Recovery returns a container to its original parent if that parent is active. If the parent is missing or in Trash, the owner chooses an active folder or the root before recovery proceeds. Tonaris never recovers the former parent automatically or picks a replacement. Cancelling leaves the item in Trash. Inherited sharing follows the chosen location (FR-07.10).

**FR-01.16 Recovery name collisions.** If a recovered container's name collides with an active sibling (FR-01.2), the owner chooses another name or destination.

- Until then the unit stays in Trash and its expiry continues to run.
- Nothing is automatically renamed, overwritten, or merged.
- A valid name or destination already supplied is used without asking again.
- Cancelling changes nothing.
- In batches, dependent steps wait while independent recoveries proceed (FR-13.4).

**FR-01.17 Retention and expiry.** Trash keeps items for 30 days from deletion, after which they and their recovery information are permanently removed.

- A restored item leaves Trash and its expiry no longer applies.
- When a container expires, only its organization is removed; its albums stay in their remaining lists or Unsorted.
- Trashed albums expire individually (FR-14.5).
- Account deletion ends all recovery windows (FR-11.11).

**FR-01.18 Early permanent removal.** This is *confirmed* (X-07) and app-only (X-03). Owners permanently delete selected Trash items, including a whole unit, or clear all of Trash. The confirmation states the scope and that it cannot be undone. Purging containers keeps active albums. Purging albums frees their slots once removal succeeds. Partial completion is reported accurately.

### FR-02 — Capture: links and manual entry

**FR-02.1 Link capture.** A user pastes a Spotify, Apple Music, Qobuz, or Tidal album link into a list or without one (FR-02.2). Common share-link variants are supported. Tonaris identifies the album behind the link (FR-02.12) and populates the available metadata automatically from permitted sources (G1): title, artist credit, artwork, source service and link, and available release information. Missing information stays unknown.

**FR-02.2 Capture without a list.** Link capture, manual entry, and MCP additions may omit a destination list, and a new unlisted album appears in Unsorted. The same information, enrichment, matching, capacity, and outcome rules apply.

- If the addition reuses an active record, that record's memberships are untouched.
- A matched trashed album added without a destination is reactivated with no memberships (FR-14.4).

**FR-02.3 Track links.** A track link resolves to the album of the release that specific link belongs to. For example, a track linked from a compilation adds that compilation, not some other album containing the song. A track from a single adds the single, which is Unclassified (FR-05.9; decided 19 October 2026). Only that album is saved, under the usual matching, duplicate, and required-information rules. Unresolvable or unsupported input is explained, with manual entry offered and the input preserved.

- Tidal and Qobuz track links name no album Tonaris may look up (G1). Such a link is explained, and manual entry opens with the link kept as the album's link for that service (decided 20 October 2026 for Tidal, 24 October 2026 for Qobuz).

**FR-02.4 Manual entry.** A regular form adds an album without a lookup.

- Required: title, artist credit, and an applicable year (FR-02.6).
- Optional, but shown: artwork URL, release classification, original release year, recording year or range, service links, and custom fields. Unused fields stay unused.
- An album can have no streaming link.
- When capture fails, the form is pre-filled with the pasted link and any retrieved or entered information.

Manual entry supplements link capture; it does not replace it.

**FR-02.5 Lookup failures.** A failed lookup explains the failure and allows a retry without losing the link.

**FR-02.6 Required information everywhere.** Every saved album has a title, an artist credit, and an applicable year:

- non-live releases: original release year;
- live releases: recording year or range, or the original release year if the recording year is unknown. Both are not needed.

This is enforced for manual entry, capture, MCP, and edits.

- Incomplete automated additions need completion before saving; batches and MCP report the missing information instead of creating incomplete records.
- Required values are never invented.
- Edits cannot clear a required value.

**FR-02.8 Chronology and classification.** Release type, live classification, original release year, and live recording year or range are distinct, editable information.

- Initial classification follows the canonical metadata source's main release identity (currently MusicBrainz release-group types; tech spec), mapped to product categories (FR-05.9).
- Enrichment happens only where the information is reliable; otherwise values stay unknown.
- Provider release years, including a reissue's, are never presented as live recording years.

**FR-02.9 Incoming-link matching.** When a supplied link confidently identifies the same album as a saved one, including one in Trash (FR-14.4), Tonaris adds the link to that album and reuses it for the requested membership. FR-01.7 still applies.

- Uncertain matches require user confirmation before linking. Tonaris never guesses or silently merges.
- A link to another edition of a saved album identifies that album (FR-02.12).
- Two albums are the same only through the canonical metadata source's album identity or a shared service link. Artist/title similarity alone never merges them.
- **Open:** evidence and confidence criteria (G2).

**FR-02.10 Uncertain matches without immediate confirmation.** In batches and MCP operations, uncertain items stay unapplied: no link attached, no membership added, no new record created. Unambiguous items continue. Items needing confirmation are reported separately, with their links and information preserved for review.

**FR-02.11 Batch capture.** Batch additions process valid records and report invalid ones with reasons (FR-13.4).

**FR-02.12 Album identity.** Tonaris identifies albums, not editions.

- A link to any edition of an album, such as a remaster, a deluxe edition or a regional release, identifies that album as the canonical metadata source groups it (currently MusicBrainz release groups; tech spec).
- The album keeps its canonical title and original release year: a link to "Bleach (Deluxe Edition)" saves *Bleach* (1989).
- Edition details aren't captured in this version. Custom fields can record them.

**Decided:** permitted use in the G1 terms review (19 October 2026), and metadata access (G1) and album matching (G2) on 21 October 2026.

### FR-03 — Metadata and custom fields

**FR-03.1 Editable metadata.** All supported album metadata is editable: title, artist credit, chronology fields, release classification, service links (FR-06.3), and artwork URL. Edits enforce FR-02.6 and field validation. Folder and list names and descriptions are editable too.

**FR-03.2 Current values only.** A manual correction replaces the saved value. Tonaris keeps current metadata and saved source links. It does not keep previous provider values, a comparison view, or a full edit history. Temporary input kept for conflict or failure review (FR-09.4, FR-13.2) is still required. Distinct chronology fields are never collapsed, and edits never remove links or change album identity automatically.

**FR-03.3 Enrichment fills gaps only.** Automatic enrichment, whether on capture, on retry, or from a newly matched link from another service, fills missing values only. It preserves populated values, imported or manual, including when another service supplies a conflicting classification. Users can explicitly replace any value.

**FR-03.4 Artwork.** Users enter or replace the artwork URL in the manual form and when editing. Enrichment keeps an existing URL. Missing or unavailable artwork never blocks using an album.

**FR-03.5 Descriptions.** Folders and lists have an optional plain-text description. The owner or a Manage collection agent edits it as an ordinary change. Descriptions survive moves and Trash, are visible to authorized viewers, are excluded from search (FR-12.4), and are included in exports (FR-08.3).

**FR-03.6 Field definitions.** Users define custom fields at account level. The types are text, number, date, yes/no, single choice, and multiple choice. Choice fields define their options in the definition. There are no predefined fields.

**FR-03.7 Per-album usage.** Each album optionally applies any defined fields. Values are saved per album and shared across its list appearances. Defining a field applies it nowhere. An applied field may be empty. *Applied-empty*, *unused*, and *unknown* stay distinct and are never replaced with zero, No, or a default choice.

**FR-03.8 Removing a field from an album.** This clears that album's value, and reapplying the field starts empty: no hidden value is kept. The definition, its options, and other albums are unaffected. Clearing a value while keeping the field applied leaves it applied-empty. Fields are never removed automatically to get around FR-03.12.

**FR-03.9 Field-name uniqueness.** Field names are unique within an account across all types (X-06). For example, a number field "Rating" and a choice field "rating" cannot coexist. Different accounts may reuse names.

**FR-03.10 Basic validation.**

| Type | Accepts |
| --- | --- |
| Text | text |
| Number | valid numbers |
| Date | valid calendar dates |
| Yes/no | Yes or No |
| Single choice | at most one existing option |
| Multiple choice | a set of existing options, without repeats |

Field names and option labels cannot be blank. User-configurable rules (ranges, patterns, required fields) are excluded. Operational limits such as lengths and counts are set in the tech spec (FR-15.4).

**FR-03.11 Renaming a field.** Renaming changes the same definition across the account without altering its type, options, usage, or values (X-09).

**FR-03.12 Changing a field's type.** A type change is allowed only while no active or trashed album uses the field; an applied-empty field counts as used. A rejected change explains that a new field of the desired type can be created instead. Values are never cleared, usage removed, or data converted to make a change possible. An allowed change keeps the same field and name and validates the new configuration.

**FR-03.13 Options on type change.**

- Switching between single choice and multiple choice keeps the options.
- Switching a choice field to a non-choice type discards its options. The app shows this clearly, and the MCP outcome reports it.
- Switching back later does not restore the discarded options.

**FR-03.14 Option-label uniqueness.** Option labels are unique within each choice field (X-06); different fields may reuse labels. A removed option no longer reserves its label, and recreating that label does not restore the old option or its cleared selections.

**FR-03.15 Adding options.** New options become available across the account without being assigned to any album. Existing options and selections are preserved.

**FR-03.16 Renaming options.** Renaming keeps the same option and all its selections. The new label appears everywhere, including in shared views and after Trash recovery. Options are never merged.

**FR-03.17 Removing options.** Removing an unused option is an ordinary change. Removing an option that any active or trashed album uses is *confirmed* (X-07): Tonaris names the field, the option, the affected albums (including in Trash), and the effects on shared views.

- Removal clears the option from every affected album.
- A single-choice value becomes empty; a multiple-choice value keeps its other selections.
- Removing an album's last selection leaves the field applied-empty.
- No saved selection may reference a removed option.

**FR-03.18 Deleting a field.** Permanent deletion is always *confirmed* (X-07), even for unused fields. The warning covers the definition, its options, all album usage and values across the account (including in Trash), the effects on shared views, and that neither Trash nor album restoration can recover them. Deletion removes all usage and values from active and trashed albums, and no album data may reference the deleted field.

**FR-03.19 Shared visibility.** Viewers of a shared album see all custom fields it uses, with their values, including fields applied later (FR-07.12).

**FR-03.20 Listening data.** Automatic listening-history tracking is excluded. Users or Manage collection agents may maintain fields such as "Last listened" or "Listening status" under the ordinary rules. Opening a service link never marks an album as listened or fills fields. Tonaris never imports listening history. Ratings, notes, and status are possible uses, not predefined fields.

### FR-04 — Viewing and editing modes

**FR-04.1 Modes.** In the desktop app, users switch between a viewing mode (browsing and opening albums without editing clutter) and an editing mode. Mobile web offers browsing only.

**FR-04.2 Mode safety.** The active mode is always clear, and a mode never grants write access. Leaving editing mode protects unsaved changes or clearly reports them. The controls and whether the mode persists are defined in the design spec.

### FR-05 — Sorting, grouping, and manual order

**FR-05.1 Sort modes.**

- Folders and the root sort their contents by name, creation date, or manual order.
- Lists and Unsorted sort albums by name, chronological year, or manual order.

Automatic sorts support ascending and descending order. How lists and folders mix under each sort is defined in the design spec.

**FR-05.2 Personal presentation.** Sort mode, direction, grouping, and manual arrangement belong to each person: owner, signed-in viewer, or guest. They never change another person's view or the shared content. Rearranging never changes memberships or hierarchy; moving items between containers is a collection edit. Rearranging is offered on desktop. Mobile browsers show the saved arrangement but do not offer rearranging (section 2.2).

**FR-05.3 Collection root.** The root uses folder-style sorting and personal arrangement. Rearranging at the root does not move containers or change sharing. The root is not shareable.

**FR-05.4 Unsorted presentation.** Unsorted supports the same sorting, directions, grouping, and manual order as lists. Arranging never creates memberships. Contents follow memberships automatically, and preferences are kept. Where new items go, and whether positions are remembered when albums leave and return, are design and tech decisions within the FR-09.4 conflict rules.

**FR-05.5 Chronological rule.**

- **Non-live releases** (studio albums, non-live EPs and compilations) use the original release year, even when the captured link points to a later remaster or deluxe release.
- **Compilations** use the compilation's first release year, not its tracks' years.
- **Live releases**, including live EPs and compilations, use the recording year or range. A range sorts by its start year in both directions and is displayed in full: 1978–1982 sorts as 1978.

**FR-05.6 Missing recording year.** A live release with an unknown recording year sorts by its original release year. The recording year stays unknown, and the interface indicates the fallback.

**FR-05.7 Release-type grouping.** Users choose a combined view or grouping into Album, EP, Live, and Compilation, plus Unclassified for unknown types. Grouping is presentation only: no copies or extra lists. Everyone sees the same app-defined group sequence, which users cannot reorder. The exact sequence is defined in the design spec.

**FR-05.8 Grouping and sorting are independent.** Grouping works with every sort mode, and switching one never changes the other. When grouped, the selected order applies within each group. Manual order uses the same personal arrangement in combined and grouped views, and switching never resets it. This applies to owned, shared, and guest views.

**FR-05.9 Group assignment.** Each album appears in exactly one group.

- Live classification takes priority over EP and Compilation. The EP and Compilation groups hold non-live releases.
- An unknown type goes to Unclassified when grouped and stays in the normal flow when combined. A type is never assigned just to place an album.
- Mixed content follows the metadata source's main release identity: live bonus tracks do not make a studio release Live, and vice versa.
- Singles, and any other release type outside Album, EP, Live, and Compilation, go to Unclassified. A live single stays Unclassified: the source's live or compilation marking doesn't move a single out of it (decided 24 October 2026).
- Users can correct classification. There is no track-by-track classification.

**FR-05.10 Initial presentation.** The design spec chooses the initial sort, grouping, and mode on entry, within the supported options, device scope, and permissions. Saved account defaults and remembered choices take precedence (FR-11.7).

### FR-06 — Streaming-service links

**FR-06.1 External playback.** Playback happens in the selected service's app or website. Tonaris manages album information, artwork, organization, and links.

**FR-06.2 One link per service.** Albums may have service links; they are optional for manually created albums. A saved album has at most one current link per supported service.

**FR-06.3 Manual link editing.** Users add, replace, or remove links as editable metadata.

**FR-06.4 Link conflicts during capture.** Capture and enrichment may fill an absent link.

- If a confidently matched link differs from the album's populated link for that service, Tonaris keeps the existing link and reports the alternative for explicit replacement. It never silently overwrites or accumulates same-service links.
- Equivalent share-link variants of the same release are not conflicts. Normalization is defined in the tech spec.
- The match can still apply the requested membership, and the retained-link outcome is reported separately.
- Populated links change only through an explicit edit within the user's requested task.

**FR-06.5 Explicit service choice.** For each opening, the person (owner, viewer, or guest) explicitly picks a service among the available links. There is no preferred-service setting and no automatic choice.

**FR-06.6 Web page or app, by setting.** Each signed-in person chooses whether service links open the service's web page or its app. The setting is saved to the account and synchronizes (FR-11.8). Links open the web pages until the person chooses the app, and guests' links always open the web pages. Either way, Tonaris opens the same release on the same service and never switches service or release. Browsers don't tell a page whether an app opened, so a link to an app that isn't installed may simply not open (decided 30 October 2026, replacing "app first, then web").

**FR-06.7 No link discovery.** The app and MCP never offer catalog search to users and never discover links. They resolve, enrich, and match supplied links (FR-02). To identify the release behind a supplied link, Tonaris may automatically query metadata sources (G1). This never adds a link or an album the user didn't supply.

**FR-06.8 No false promises.** Tonaris guarantees nothing about playback, subscriptions, or regional availability, and never presents an unverified cross-service match as the same album.

### FR-07 — Read-only sharing

**FR-07.1 What can be shared.** Owners share lists and folders read-only, by account invitation, by guest-viewable link, or both. The root is not shareable. Collaborative editing, discovery feeds, follows, and comments are excluded. Without link sharing, a forwarded page URL grants no access; only accepted grants or valid links do. Notion is a reference for the experience.

**FR-07.2 Private by default.** New lists and folders have no audience unless they are created inside a shared folder, in which case they inherit its audience (FR-07.8). Sharing beyond inherited access requires an explicit owner action in the app.

**FR-07.3 Owner identification.** Shared content and invitations show the owner's display name (FR-11.3), never their sign-in email. Names do not confer access or identity.

**FR-07.4 Invitation eligibility.** Invitations target existing registered accounts only. An unregistered recipient is rejected (X-05): no account is created, no admission granted, no invitation queued. The owner may use link sharing instead.

**FR-07.5 Invitation delivery.**

- A new invitation appears as pending in the recipient's app and is emailed to their current verified address.
- The email links to the pending invitation. It is not a guest link, does not bypass sign-in or acceptance, and forwarding it grants nothing.
- Creation and email-sending outcomes are reported separately: sending, failed, or unconfirmed. Delivery is never claimed prematurely.
- A saved invitation stays available if the email fails.
- Retries never duplicate invitations or grants.
- Opening an invalidated invitation explains that it is unavailable.

**FR-07.6 Acceptance.** Pending and declined invitations grant nothing. The signed-in intended recipient accepts or declines in the app.

- Acceptance grants read access to the current shared scope, including a shared folder's descendants.
- It adds the live collection to Shared with me, reusing an existing reference. Nothing is copied and no slots are used.
- An invitation that has become invalid grants nothing.
- Declining never revokes access that comes from other grants or valid links.

**FR-07.7 Leaving.** A recipient can leave an accepted invitation-based share. Leaving withdraws that grant, including the descendant access inherited through it, and removes its contribution to Shared with me and search.

- Other grants and saved link references remain.
- The owner's content and other viewers are unaffected.
- A later invitation starts as pending, and Trash recovery never revives a withdrawn grant.
- Removing a saved reference (FR-07.13) is separate and revokes no grant.

**FR-07.8 Folder scope.** Sharing a folder shares all its current and future descendants recursively, in both sharing modes. For example, viewers of a shared "Death Metal" folder see a new subgenre folder as soon as it is created inside it.

**FR-07.9 Sharing on moves.** Inherited access follows the current hierarchy.

- Moving an item into a shared folder grants that folder's audience.
- Moving it out removes access inherited from folders that no longer contain it.
- Direct shares on the moved item or its descendants remain until revoked.
- Other access paths, such as the destination's ancestors, remain.

**FR-07.10 Sharing and Trash.** Trashed content is inaccessible through sharing. Its direct shares, including those on descendants, are preserved but suspended.

- Recovery reactivates preserved, unrevoked links and accepted grants.
- Pending invitations stay pending.
- Revocations, link disables, and withdrawn grants made in the meantime stay in effect.
- Inherited access follows the current hierarchy.

**FR-07.11 Live content.** Viewers always see current saved content within scope, including additions, removals, metadata, descriptions, and display-name changes, without the owner republishing.

**FR-07.12 Shared information.** Viewers see standard album information and every custom field the shared albums use (names and values), including fields applied later. They never see albums outside the scope or unused field definitions.

**FR-07.13 Saved link-shared references.** A signed-in viewer can explicitly add a valid link-shared list or folder to Shared with me, in the app or through a Manage collection agent. Opening a link alone saves nothing.

- A reference points at the live content, including accessible descendants. Nothing is copied and no slots are used.
- Adding the same collection again reuses the existing reference.
- References persist and synchronize.
- Viewers can remove a reference at any time, even when its content has become inaccessible. Removal stops its search contribution but keeps other access paths.
- References never grant access beyond current sharing. Inaccessible content is excluded from search and reports that it is unavailable when opened.
- Guests cannot save references.

**FR-07.14 Informed sharing.**

- **Before sending an invitation or enabling a link,** Tonaris explains that viewers see all fields the shared albums use, including fields added later. For folders, it explains that current and future descendants are included. For links, it explains that anyone with the link can view.
- **Desktop moves and container or album recovery** show the effective sharing consequences before they apply: newly inherited audiences and preserved direct shares. They never imply content becomes private while another access path remains.
- **MCP** reports sharing effects and includes them in confirmations that are already required. Ordinary moves and recovery need no extra approval.
- No field-level privacy controls are added.

**FR-07.15 Managing access.** Owners inspect and revoke invitations, direct grants, and link settings (app-only, X-03). Revoking one path keeps the others. Revocation blocks future access but cannot retract copies already made. Moves and recovery through MCP still apply FR-07.9 and FR-07.10.

**FR-07.16 Link revocation.** Disabling link sharing invalidates the current link, including descendant access through it. Re-enabling creates a new link; old links never work again.

- Saved references that relied only on the revoked link become inaccessible and leave search. They are not silently moved to the new link.
- A viewer who has the new link can add it again, which reuses the same reference.
- Trash suspension is not revocation.

**FR-07.17 Personal views of shared content.** Viewers choose their own sorting, grouping, and arrangement (FR-05.2). The owner's preferences are not shared.

### FR-08 — Data export

*Replaces iteration 5's "Future backup compatibility" (see change log).*

**FR-08.1 Download your data.** The owner can download an export of their whole owned collection from account settings at any time (app-only, X-03; desktop required). The export lets users own and reuse their data elsewhere. Tonaris never imports or restores exports (section 2.6).

**FR-08.2 Format.** The export is one downloadable archive containing:

1. a complete structured data file in a documented, versioned, self-describing format that programs and AI tools can parse exactly;
2. a human-readable rendering of the same collection: the folder and list tree with each album's information;
3. a short guide explaining the files, fields, and value conventions.

The concrete formats are defined in the tech spec.

**FR-08.3 Contents.** As currently saved:

- every saved album: active, in Unsorted, or in Trash. Each includes all supported metadata (title, artist credit, chronology fields, release classification, service links, artwork URL), its custom-field usage and values, and its list memberships;
- the folder and list hierarchy with names and descriptions;
- custom-field definitions with types and options;
- the owner's personal manual arrangements and remembered presentation choices for their own collection (root, folders, lists, Unsorted), and their account presentation defaults;
- Trash contents, clearly marked with deletion and expiry dates, Trash units, and the preserved former hierarchy and memberships.

The distinctions between *unknown*, *unused*, and *applied-empty* are preserved.

**FR-08.4 Exclusions.** The export never contains:

- credentials, sessions, or MCP connections;
- sharing configuration: invitations, grants, recipients, or links;
- Shared with me references or other owners' content;
- account profile data (display name, sign-in email);
- artwork image files. Artwork is exported as URLs.

**FR-08.5 Consistency.** An export reflects one consistent point in time, with no half-applied changes. It states its creation time and format version. An album in several lists appears once, and its memberships reference it, so the file mirrors the collection's real structure.

**FR-08.6 Outcomes.** Tonaris reports when an export is being prepared, has succeeded, or has failed (FR-13). Exporting never changes collection data, and a failed export can be retried.

**FR-08.7 Before account deletion.** The account-deletion warning offers an export first (FR-11.10).

**FR-08.8 Independence from providers.** Saved metadata stays available for display and export without a fresh provider lookup. No provider's terms restrict a saved field (G1 terms review, 19 October 2026): canonical metadata is public-domain, values the user confirms from Apple's hints are their data, and nothing from Spotify, Qobuz or Tidal is saved. A future conflict comes back as an explicit product decision; fields are not silently dropped.

### FR-09 — Synchronization and concurrent edits

**FR-09.1 Automatic synchronization.** Saved changes reach the user's other active sessions and devices automatically, without manual refresh. Within sharing scope, they also reach invited and link viewers.

**FR-09.2 Preference synchronization.** A signed-in user's sorting, grouping, and manual arrangements synchronize across their devices for owned and shared content. Each account's preferences are independent.

**FR-09.3 Visible save state.** Pending, saved, and failed changes are distinguishable. An optimistic change that fails never keeps appearing as saved. Connection loss and concurrent edits never cause unnoticed data loss.

**FR-09.4 Conflicts.** One policy applies to app and MCP writes across sessions and agents. If a change would overwrite a newer, conflicting saved change:

- the saved state is kept and the attempt stays unapplied;
- the originator is told the current and attempted values, within their access;
- the attempt is preserved for review.

Resolution is a deliberate choice based on current state, under the usual permissions, scope, validation, and confirmations. There is no silent last-write-wins and no blind retry. Independent, non-overlapping changes proceed (FR-13.4). The policy covers collection content and personal preferences. Detection mechanisms are defined in the tech spec, and the review interaction in the design spec.

**FR-09.5 Synchronization target.** Changes reach another session of the same account within 1 s, and a viewer or guest within 2.5 s (p95; Q-01, approved 21 October 2026). Synchronization does not imply collaborative editing.

### FR-10 — AI agent access through MCP

**FR-10.1 Purpose and clients.** An authenticated, authorized agent reads and organizes the user's collection through one MCP server.

- Required client targets: **Claude web**, **ChatGPT web**, and **Codex desktop**. No particular AI models are fixed. Users connect their own AI accounts, and AI runs in their client.
- Other MCP clients may work but are not acceptance targets.
- Tonaris provides connection instructions, including client prerequisites.
- There is no built-in chat interface.

**FR-10.2 Connection scope.** A connection covers the user's whole collection: albums, folders, lists, custom-field definitions, Unsorted, Trash, and saved shared references. There are no per-folder or per-list scopes. Access to other owners' content follows FR-07. Agents act within the user's requested task.

**FR-10.3 Permission modes.** The user picks a mode per connection when authorizing it, and can inspect or revoke the connection in the app.

| Mode | Allowed |
| --- | --- |
| Read-only | Read and search accessible information, and inspect the owner's Trash. No writes of any kind: content, Trash, references, or preferences. |
| Manage collection | Everything Read-only allows, plus ordinary operations (FR-10.4) without extra app approval, including in batches, and approval-gated operations (FR-10.6). |

An approval never elevates a Read-only connection or enables an app-only operation (X-03).

**FR-10.4 Ordinary operations (Manage collection).**

- Create and rename lists and folders, and edit their descriptions.
- Add albums from supplied links or manual data (FR-02).
- Edit metadata and field values, and apply or remove fields on albums.
- Create definitions (including initial options) and rename them.
- Change the type of unused fields.
- Add and rename options, and remove unused options.
- Move content.
- Recover from Trash (FR-10.7).
- Change the user's personal presentation and manual order.
- Save or remove the user's shared references.

Batch size alone never triggers confirmation.

**FR-10.5 Agents supply links.** Client agents find links with their own capabilities and submit them. MCP applies the FR-02 rules and never discovers links (FR-06.7). To identify a Qobuz or Tidal link an agent adds, Tonaris doesn't read the store's page (G1). A link it can't identify comes back asking the agent for the required information (FR-02.6), with the link kept. The details the agent then sends are matched as a store page's would be: when exactly one album fits their title, artist and original year, the album is saved as that album, keeping the agent's values and filling the rest, artwork included (FR-03.3). Otherwise it is saved as entered (decided 30 October 2026, TON-111).

**FR-10.6 Approval-gated operations.** These require explicit user approval before execution:

- deletion into Trash of albums, lists, or folders;
- removing choice options that would clear selections, including an unused option that becomes used before execution;
- permanent field deletion, even for unused fields;
- confirming uncertain album matches (FR-02.9).

Before asking, the agent presents the targets and consequences: shared-view effects, album retention or collection-wide removal, the recovery window or that recovery is impossible, and the affected album scope, including Trash.

- One approval may cover a clearly defined batch.
- An approval covers only the described scope; an expanded scope needs a new approval.
- Unapproved, declined, or cancelled operations change nothing.
- Permission alone never substitutes for approval.
- Tonaris must be able to verify the approval itself rather than trust an agent's claim. The owner approves the exact scope in Tonaris, on a page the agent links to. The operation runs only while its scope is unchanged, once, and within 30 minutes. This was verified in all three required clients on 21 October 2026 (G3).

**FR-10.7 Trash through MCP.** Both modes can inspect Trash. Manage collection connections recover albums, lists, and hierarchies within the retention window under the app's rules (FR-01.13–FR-01.16, FR-07.10, FR-14), including asking the owner for a destination when needed. Expired or purged items are reported as unavailable, not recreated. Permanent removal stays app-only.

**FR-10.8 Client confirmation boundary.** "No extra app approval" does not guarantee prompt-free execution, because clients may add their own prompts. Clients can never bypass permission modes, approvals, or app-only restrictions. These boundaries are verified in each required client (G3).

**FR-10.9 Outcomes for agents.** MCP returns useful outcome and failure information (FR-13), including item outcomes in batches, conflicts (FR-09.4), and sharing effects (FR-07.14). Collection text returned to agents is data, not instructions (Q-05).

### FR-11 — Authentication, accounts, and settings

**FR-11.1 Passwordless sign-in.** Users sign in by proving access to their email through a one-time link or code; the choice is a design decision. They can sign out. Returning users reach the same account with their collection, sharing access, and preferences intact. Password and provider sign-in are not in the first version.

**FR-11.2 Invite-only account creation.** Creating an account requires a valid admission invitation from the creator. It is unavailable while admissions are paused. Email verification alone never admits. Existing users sign in normally.

**FR-11.3 Display name.** Users set and edit a display name in settings. It is optional for account creation, private use, and viewing shared content. It is a non-unique label, not an identity or credential, and it is never derived from the email.

- It is required (non-blank) before sending an invitation or enabling a link, and stays required while any sharing is enabled.
- If it is missing, the sharing action is not applied, with an explanation.
- Clearing it while sharing is enabled is rejected (X-05).
- It appears on shared content and invitations, including guest pages, and changes there are live.
- Inherited sharing does not require a separate name per container.

**FR-11.4 Changing the sign-in email.** Users who still have access to their current email can change it after verifying both the current and the new address.

- The same account keeps all its data and access, and no new admission is needed.
- The old address stops signing in.
- A cancelled or failed verification changes nothing.
- A change can never take over or merge another account.

**FR-11.5 Creator-assisted recovery.** A user who has lost access to their email can ask the creator for help.

- The sign-in address changes to a newly verified email only after account ownership is established. Verifying the new address, or making the request, is not enough on its own.
- The same account and its data are kept, and the old address stops working.
- The request is refused if ownership cannot be verified or the change would take over or merge another account.
- Deleted accounts are never recreated.

The ownership-verification procedure is defined in the tech spec, and the request experience in the design spec.

**FR-11.6 Admission administration.** A creator-only desktop interface issues, inspects, and revokes admission invitations, and pauses or resumes admissions.

- Invitations are bound to one email address and are single-use. A different address cannot register with a forwarded invitation.
- Each invitation shows its status (available, redeemed, revoked, expired), with creation and email-sending outcomes reported separately.
- Revocation prevents redemption but never deletes admitted accounts.
- Pausing keeps existing users' access and neither redeems nor revokes outstanding invitations.
- A failed or unconfirmed registration is reconciled safely: an invitation is never consumed without an account, and no account is duplicated.
- Administration grants no access to other users' private collections.

**FR-11.7 Viewing defaults.** Signed-in users have account defaults for sorting and for combined or grouped presentation. A list or folder with no remembered choice uses the defaults; so do the root and Unsorted. Remembered per-view choices and manual arrangements take precedence and survive changes to the defaults. This applies to owned and accessible shared content; the root and Unsorted are owner-only.

**FR-11.8 Saved per account.** Defaults, remembered choices, and arrangements are saved to the account and synchronize (FR-09.2).

**FR-11.9 Guests.** Signed-out viewers can adjust sorting, grouping, and arrangement for the current visit only. Nothing is saved, and reopening starts from app defaults. Guests have no collection, references, or settings. Saving anything requires an account.

**FR-11.10 Account deletion.** This is *confirmed* (X-07) and app-only (X-03). The warning explains the full consequences:

- the owned collection, including Unsorted and Trash, is permanently removed;
- settings and saved references are removed;
- content shared with others becomes unavailable to every viewer, including guests;
- MCP connections are revoked;
- deletion is permanent, and Trash cannot recover the account.

The warning offers an export first (FR-08.7). Cancelling changes nothing.

**FR-11.11 Permanent deletion policy.** Deletion is irreversible after confirmation, with no grace period. Tonaris promptly:

- ends sessions;
- revokes MCP authorizations;
- makes owned shared content unavailable;
- permanently removes the account and all owned data, overriding Trash windows (nothing goes to Trash).

Other users' collections are untouched, and their references to the deleted content no longer grant access. Signing in later never recreates the account or its data; a new account needs admission. Progress, completion, and failures are reported. Treatment of historical backups follows Q-04.

**FR-11.12 Provider separation.** App authentication and streaming-account connection are separate, and signing in never connects a streaming account. Spotify or Apple authorization may be added where an agreed feature needs it. It does not imply extra catalog permissions or lift provider restrictions.

**FR-11.13 Settings inventory.** Required settings are display name, sign-in email, viewing defaults, MCP connections (FR-10.3), data export (FR-08), and account deletion. The creator also has admission administration (FR-11.6).

### FR-12 — Search

**FR-12.1 Scope.** Signed-in users search their active owned collection, including Unsorted, and eligible shared content (FR-12.3). Trash is browsed, not searched. Global search requires sign-in; search within a guest share is not required. App and MCP search use the same scope, matched fields, and matching rules.

**FR-12.2 Global quick search.** One Command-K-style search is available throughout the signed-in app, through the platform shortcut and an accessible on-screen control. It is independent of the current location and opens matching content.

**FR-12.3 Shared content.** Search includes content accessible through accepted invitations and link-shared collections explicitly saved to Shared with me. Opening or supplying a link does not add it, and search never discovers others' links.

- Results respect live changes, revocation, moves, Trash suspension, and recovery. Inaccessible content never appears in results or previews.
- Owned and shared results are distinguished.
- Results show only accessible locations, never private ancestor names or paths.
- Shared results copy nothing and use no slots.

**FR-12.4 Matched fields.** Search matches only folder names, list names, album artist credits as saved, and album titles. It does not match descriptions, custom-field names, values, or options, or other metadata. Results identify the content and its accessible location. Streaming catalogs are not searched.

**FR-12.5 Matching.** Matching is case- and accent-insensitive and partial: "metal" matches "Metallica", and "bjork" matches "Björk". Results display the original spelling. There is no typo tolerance.

**FR-12.6 Performance.** Search stays responsive at 5,000 owned albums plus representative shared content: quick search updates within 50 ms p95 per keystroke (Q-01, approved 29 October 2026).

### FR-13 — Errors, outcomes, and recovery

**FR-13.1 Clear failures.** Tonaris explains failures with what failed and, where known, an actionable next step: fix the input, use manual entry, retry, or re-authorize. Failures include:

- invalid or unsupported links, and inaccessible releases;
- provider or connection failures;
- missing or invalid information;
- capacity limits and permission failures;
- save and synchronization failures, and conflicts;
- Trash recovery issues.

**FR-13.2 Preserve input and saved state.** Pasted links, retrieved metadata, and entered information are kept for correction or retry. A failure never silently loses or overwrites saved content. Missing optional metadata and unavailable artwork are distinguishable from failures that prevent saving.

**FR-13.3 Truthful outcomes.** Every operation reports succeeded, failed, pending, or unconfirmed. Success is never shown for an unconfirmed operation.

**FR-13.4 Batches.** These rules cover every supported batch, through the app, link capture, MCP, or Trash recovery.

- Valid, independent changes are applied even when others fail, and successes are kept rather than rolled back.
- A dependent step runs only after its prerequisite has succeeded and been confirmed. If the prerequisite failed, was skipped, awaits input or approval, or is unconfirmed, dependents stay unapplied, with the reason given.
- Outcomes are reported distinctly as completed, failed, skipped, pending, or unconfirmed, with reasons and next steps. Inputs for unfinished work are preserved.
- Batching never bypasses validation, capacity, ownership, permissions, approvals, data consistency, or app-only rules, and never expands the requested scope.

**FR-13.5 Safe retries.** A retry never duplicates completed changes or albums, never overwrites later edits, and respects identity and enrichment rules. An unconfirmed outcome is reconciled against saved state before it is retried.

**FR-13.6 Agent diagnostics.** MCP exposes the same outcome information in a form agents can act on. Formats are defined in the tech spec.

### FR-14 — Album deletion and recovery

**FR-14.1 Delete from the collection.** "Delete album from collection" is *confirmed* (X-07) and is distinct from removing a membership. The confirmation explains that the album leaves every list and Unsorted and goes to Trash for 30 days. A deleted album leaves active views and sharing. Its metadata, artwork reference, links, field usage and values, and former memberships are preserved during the window.

**FR-14.2 Restore.** The owner restores the album with its information intact.

- Former memberships in still-active lists are restored (FR-01.7 applies).
- Memberships in missing or trashed lists are skipped, with reasons.
- Lists and folders are not restored.
- If no membership can be restored, the album goes to Unsorted.
- Restored memberships in shared lists become visible to current viewers.

**FR-14.3 Same-album conflict on restore.** If restoring would create a second active record confidently identified as the same album, Tonaris pauses and explains which active record conflicts.

- Nothing changes: both records, their information, and their memberships stay as they are. The original stays in Trash with its expiry and still counts toward capacity.
- Nothing is merged, substituted, or deleted automatically.
- The owner keeps the active record, or deletes it into Trash (confirmed) and retries.
- Similarity alone does not establish a conflict. Uncertain matches follow FR-02.9.
- In batches, dependent steps wait while independent recoveries continue.
- Re-adding through capture cannot bypass this guard. An ordinary addition that reuses the active record does not recover the trashed one.

**FR-14.4 Re-addition reactivates.** An addition that confidently matches a trashed album reactivates and reuses that record.

- Populated information is preserved (FR-03.3).
- The record leaves Trash and its expiry ends.
- Only the requested memberships are applied. With none requested, the album goes to Unsorted. Former memberships stay inactive.
- It reuses the album's slot.

Uncertain matches follow FR-02.9 and FR-02.10. Explicit restore still uses FR-14.2.

**FR-14.5 Expiry and permanent removal.** Trashed albums expire individually after 30 days. Early permanent removal is app-only (FR-01.18) and frees the slot.

**FR-14.6 Capacity.** Trashed albums still count (FR-15.2). Restoration and re-addition reuse the slot and work at capacity.

### FR-15 — Capacity and resource limits

**FR-15.1 Album limit.** Each user can save up to 5,000 albums. This provisional limit is also the size used for performance targets. It can be adjusted after costs are measured and is not a guarantee of affordability.

**FR-15.2 Counting.** Each saved album record counts once, whether active, in Unsorted, or in Trash.

| Does not use another slot | Uses a slot | Frees a slot |
| --- | --- | --- |
| A membership in another list | A new album | Permanent removal |
| A matched service link | | |
| Viewing shared content | | |
| Removing memberships | | |
| Moving the album to Trash | | |

Restoring or re-adding an album reuses its slot, even at capacity.

**FR-15.3 Limit behavior.** One limit applies across the UI, capture, and MCP.

- Users see their active and trashed usage, and understand why an addition was refused.
- At the limit, viewing, searching, editing, removing, restoring, and exporting still work.
- A batch that exceeds capacity reports which items were not added; items are never silently dropped.

**FR-15.4 Other resources.** Container count, memberships, custom-field data, text lengths, artwork storage (including any cached files), provider calls, request rates, and bulk-operation volume are also bounded. There is no fixed total-account cap. The limits the creator approved on 17 October 2026 are listed in the tech spec (TS-18). At any limit, only the new item is rejected, with a clear reason (X-05), and existing content stays usable.

**FR-15.5 Operating budget.** The creator sets the monthly operating budget and chooses hosting. The specs don't estimate or plan costs; FR-15.1–FR-15.4 keep usage bounded.

## 6. Quality requirements

**Q-01 Performance.** Interactions are fast and modern, in the style of Linear's optimistic updates: immediate feedback, visible pending saves, accurate outcomes, and preserved input and saved state on failure.

Targets cover interaction feedback, browsing, sorting, search, synchronization, and export. The workload is 5,000 owned albums plus representative shared content, nesting, memberships, and fields. The measurement conditions (devices, browsers, network) are defined in the tech spec (TS-120).

**Approved where measured (21 October 2026).** The creator adopted the targets below as working targets on 17 October 2026. On 21 October 2026, after the M1 prototype measurements ([report](spikes/2026-10-21-q01-measurements.md)), they approved those that could be measured, and the viewer target on an estimate. The rest stay provisional until they are measured. An unconfirmed target cannot pass acceptance. On 29 October 2026, after the measurements on the real app ([report](performance-verification.md), TON-92), the creator approved the four that were still provisional, as they stood.

| Metric | Target | Status |
| --- | --- | --- |
| Optimistic UI feedback after a local edit | ≤ 50 ms p95 | Approved |
| Server confirmation of a single mutation | ≤ 400 ms p95 | Approved |
| Propagation to another session of the same account | ≤ 1 s p95 | Approved |
| Propagation to a viewer or guest | ≤ 2.5 s p95 | Approved; measured 29 October 2026 |
| Quick-search update per keystroke | ≤ 50 ms p95 | Approved 29 October 2026 |
| MCP search, server time | ≤ 300 ms p95 | Approved 29 October 2026 |
| Switching sort or grouping, or opening a list | ≤ 100 ms p95 (≤ 200 ms for a 5,000-album list) | Approved |
| Workspace cold start to interactive, desktop | ≤ 2.5 s p75 | Approved |
| Guest share page largest contentful paint, mobile | ≤ 2.5 s p75 | Approved 29 October 2026 |
| Export of 5,000 albums | ≤ 3 s p95 | Approved 29 October 2026 |

**Q-02 Accessibility.** Core workflows on each supported device are usable with a keyboard and a screen reader. They include owned and shared browsing, search, service choice, account access, desktop editing and administration, guest views, confirmations, errors, and pending or saved states.

- Dragging (reorder, move) has a keyboard alternative.
- Focus order is understandable and keyboard focus is visible.
- Users can identify controls and field names, read album information, complete applicable actions, review confirmations, and understand errors and pending or saved outcomes.
- Accessibility support does not change permissions or device scope (X-04).
- Acceptance includes keyboard-only and screen-reader walkthroughs, including guest sharing and failure states.

The assistive-technology, browser, and device matrix is defined in the tech spec.

**Q-03 Browser verification.** Required workflows are verified on the supported browsers for each device scope (section 2.2). Mobile browsing workflows are usable on small touch screens. The creator approved the browser, OS, and assistive-technology matrix in the tech spec (TS-122) on 17 October 2026.

**Q-04 Service disaster recovery.** Tonaris keeps automated, access-restricted operator backups of the state needed to recover the service. Restoration is documented and tested before acceptance, then re-verified on a recurring schedule. Trash and synchronization are not substitutes for backups.

- **Decided by the creator on 30 October 2026 (TON-97), and revised the same day when hosting moved to Render (TON-108):**
  - **Backups:** continuous, by the database's host: Render Postgres's point-in-time recovery, to any moment of the last 3 days on Render's Hobby plan, or 7 on Pro.
  - **Recovery point:** at most a few minutes of changes can be lost.
  - **Recovery time:** the service is back within 24 hours.
  - **Drills:** a restore drill every 3 months after acceptance.
  - **Protection:** the backups stay with Render, reachable only through the creator's Render account, on storage Render encrypts at rest. The revocation ledger that reconciles a restore is stored apart from them, outside Render and write-once (TS-112, TS-113).
- Restoring an older backup never revives deleted accounts, revoked MCP authorizations, revoked sharing, or expired recovery rights. Later deletions, revocations, and expiries are reconciled before access resumes.
- **Account deletion and historical backups (decided 30 October 2026, TON-97):** deleted data leaves the backups as they age out, within 30 days, and a restore re-applies every later deletion first (TS-113). The account-deletion screen and the privacy notice say so: "Deleted data is removed from the live service immediately and disappears from encrypted backups within 30 days. If we ever restore a backup, your deletion is re-applied before the service reopens." Immediate erasure from every backup copy is never claimed.
- Operator recovery is never a user account-recovery path (FR-11.5).
- Operator backups are separate from user exports (FR-08).

**Q-05 Untrusted input.** Supplied URLs, provider metadata, artwork, descriptions, custom-field text, and agent input are untrusted. They can never grant access, execute code, disclose credentials, or override authorization or approvals. Collection text given to agents is data, not instructions from Tonaris, and server-side checks enforce permissions whatever the text says. The tech spec covers safe URL fetching and redirects, safe rendering, secrets, and abuse limits for authentication, sharing, capture, MCP, and export. These are validated with adversarial inputs. Tonaris cannot guarantee that external AI clients resist prompt injection.

**Q-06 Security and privacy.** Ownership and read-only access are enforced across the app, MCP, and sharing. Defaults are private and agent authorization is explicit. Credentials are excluded from shared content and exports, and retention and deletion behavior is clear. The tech spec contains the threat model.

**Q-07 Reliability.** Saving, moving, recovering, and deleting never lose data silently. The FR-09 and FR-13 behaviors and the Trash recovery conflict rules (FR-01.15, FR-01.16, FR-14.3) are validated.

**Q-08 Portability.** User data and service operation can move to another host without a proprietary backend. Data is plain and documented, and users can take theirs via FR-08. Streaming catalogs remain external dependencies. The original preference stands: a traditional database and API rather than a tightly coupled proprietary backend such as Convex. A traditional database alone does not establish portability.

**Q-09 Maintainability.** Developer setup and verification workflows for the creator-hosted service are documented.

**Q-10 Experience direction.** A coherent custom design system, minimal and fast, with a dark theme for the first version. Linear is the reference for clarity, polish, look and feel, and responsiveness. Details are in the design spec.

**Project workflow.** Linear for project management, GitHub for source hosting, and OpenSpec for spec-driven development. Deployment hosting is chosen in the tech spec.

## 7. Acceptance checks

These are representative observable checks, not a test plan. Passing them does not waive any other rule; detailed test cases derive from the FR rules.

The first version's results, with the evidence for each check and what waits for the creator, are in [the acceptance walkthrough](acceptance-walkthrough.md) (30 October 2026, TON-98).

| ID | Scenario | Expected outcome | Rules |
| --- | --- | --- | --- |
| AC-01 | Register and return | Register with a valid creator invitation and verified email while admissions are open, with no country restriction or account cap. Sharing grants no admission. Existing users keep access while admissions are paused. Returning sign-in reaches the same account. | FR-11.1–FR-11.2, FR-07.4 |
| AC-02 | Administer admissions | Creator-only desktop controls issue, inspect, and revoke email-bound single-use invitations and pause or resume admissions. Forwarded invitations cannot enroll another address. Retries create no duplicate accounts and lose no invitations. | FR-11.6 |
| AC-03 | Organize containers | Create root and nested lists and folders, and rename them without sibling collisions across types. Descriptions are editable, visible live to viewers, kept through moves and recovery, and not searched. | FR-01.1–FR-01.3, FR-03.5, FR-12.4 |
| AC-04 | Move folders and lists | Moves keep identity, contents, descriptions, direct shares, and preferences without copying. Cycles, invalid destinations, and collisions are rejected with nothing changed. Inherited access updates. | FR-01.4–FR-01.5, FR-07.9 |
| AC-05 | Reuse albums across lists | One album's metadata and fields are shared across lists. Re-adding keeps one entry and position. Removing the last membership keeps the album in counted, searchable Unsorted. | FR-01.6–FR-01.9, FR-15.2 |
| AC-06 | Capture supplied links | Valid album links from all four services resolve. Track links add their actual parent release, except Tidal's and Qobuz's, which go to manual entry with the link kept (FR-02.3). Failures preserve input, explain the problem, and offer manual entry. | FR-02.1, FR-02.3, FR-02.5 |
| AC-07 | Save without a list | Capture, manual entry, and MCP can omit a list. New unlisted albums appear in Unsorted, reused records keep memberships, and a matched trashed record reactivates with only the requested memberships. | FR-02.2, FR-14.4 |
| AC-08 | Complete required information | Manual entry shows all fields and requires title, artist credit, and applicable year. The same minimum applies to capture, MCP, and edits. Incomplete input is preserved, never saved invalid or invented. | FR-02.4, FR-02.6 |
| AC-09 | Identify and match albums | A link to any edition identifies the album, with its canonical title and original year. Confident matches reuse records, and uncertain matches wait unchanged while independent items proceed. | FR-02.9–FR-02.10, FR-02.12 |
| AC-10 | Correct and enrich metadata | Edits update every appearance and shared view. Enrichment fills only missing values. No previous-value history is kept, and chronology fields stay distinct. | FR-03.1–FR-03.4 |
| AC-11 | Use optional fields | Fields apply per album and are validated by type. Applied-empty stays distinct from unused, zero, and No. Removing a field from an album clears its value; reapplying starts empty. | FR-03.7–FR-03.8, FR-03.10 |
| AC-12 | Manage definitions and options | Field-name and option-label uniqueness is case-insensitive. Renames keep selections. Removing a used option and deleting a field are confirmed across active and trashed albums. Recovery never recreates them. | FR-03.9, FR-03.11, FR-03.14–FR-03.18 |
| AC-13 | Change field types | Changes are allowed only with no usage, including applied-empty. Options are kept between choice types and visibly discarded otherwise, with no automatic restoration. Used fields are rejected without touching data. | FR-03.12–FR-03.13 |
| AC-14 | Apply chronology | Non-live releases use the original release year. Live releases use the recording year or range (sorting by its start year), with a visible fallback to the release year. Reissue and track dates never substitute. | FR-02.8, FR-05.5–FR-05.6 |
| AC-15 | Combine sorting and grouping | Grouping and sorting switch independently and keep the manual arrangement. Live takes priority, unknown types go to Unclassified, mixed releases follow the main identity, and the group sequence is fixed. | FR-05.7–FR-05.9 |
| AC-16 | Personal presentation | Owned and shared presentation is personal and synchronizes for signed-in users. Defaults apply to unvisited views and remembered choices win. Guests' choices last one visit. | FR-05.2, FR-11.7–FR-11.9 |
| AC-17 | Unsorted and root presentation | Unsorted supports list-style sorting and grouping, and the root supports folder-style sorting, both with remembered, synchronized choices. Rearranging never creates memberships, moves containers, or changes access. | FR-05.3–FR-05.4 |
| AC-18 | Open the selected service | Explicit service choice every time. Each link opens the same release on the chosen service, on its web page or in its app as the person's setting says, and never switches provider. | FR-06.5–FR-06.6 |
| AC-19 | Same-service link conflicts | At most one link per service. A confident capture with a different link keeps the existing one and offers explicit replacement, and the membership still succeeds. Variants of the same release are not conflicts. | FR-06.2–FR-06.4 |
| AC-20 | Sharing inheritance | New content is private unless created under a shared ancestor. Folder shares include current and future descendants. Moves update inherited access and keep direct shares. Viewers see live content, descriptions, and used fields only. | FR-07.2, FR-07.8–FR-07.9, FR-07.11–FR-07.12 |
| AC-21 | Sharing disclosure | Before sharing, viewers' field visibility, folder descendants, and link forwarding are explained. Desktop moves and recovery preview effective sharing. MCP reports sharing effects without extra approval for ordinary operations. | FR-07.14 |
| AC-22 | Invitations | Unregistered recipients are rejected. Invitations are saved as pending and emailed, survive a failed email, and grant access only after the intended recipient accepts. Declining grants nothing. | FR-07.4–FR-07.6 |
| AC-23 | Leave and revoke | Recipients leave without affecting other paths. Owners inspect and revoke. Disabling a link invalidates it, and re-enabling creates a new link without reviving old ones or silently upgrading references. | FR-07.7, FR-07.15–FR-07.16 |
| AC-24 | Saved references | Explicitly saving link-shared content creates no copies, slots, or duplicates. Opening a link alone adds nothing. References synchronize and can be removed even when inaccessible. Guests and Read-only agents cannot change them. | FR-07.13, FR-10.3 |
| AC-25 | Search | Shortcut and on-screen access. Only folder names, list names, artist credits, and album titles are matched, partially and case- and accent-insensitively. Owned and eligible shared content is included. Trash, other fields, unsaved links, and private paths are excluded. App and MCP behave the same. | FR-12 |
| AC-26 | Guest browsing | Guests navigate authorized shares, adjust presentation for the visit, and open service links. Global search requires sign-in; search within a guest share is not required. | FR-11.9, FR-12.1 |
| AC-27 | Delete and recover containers | Folder deletion is confirmed and keeps albums. Recovery uses active albums only, reports skipped items, and asks for a destination or a new name when needed. Pending choices keep their expiry, and cancelling changes nothing. | FR-01.11, FR-01.14–FR-01.16 |
| AC-28 | Trash units | Hierarchies deleted together recover and purge as one unit. Separately deleted items keep their own units and expiry. | FR-01.13 |
| AC-29 | Delete, recover, re-add albums | Deletion moves the album to 30-day Trash. Restore brings back active-list memberships, and re-adding applies only the requested memberships. Both reuse the slot. A same-album conflict pauses with both records unchanged. | FR-14 |
| AC-30 | Sharing during Trash | Trashed content leaves shared views and search. Recovery resumes unrevoked links and accepted grants, keeps pending invitations pending, and never revives revoked access. | FR-07.10 |
| AC-31 | Expire and clear Trash | Expiry is shown and enforced at 30 days. Early removal is app-only and confirmed. Purging containers keeps active albums, and purging albums frees slots. Partial outcomes are reported. | FR-01.17–FR-01.18 |
| AC-32 | Capacity | Active plus trashed records are counted, including Unsorted. Memberships, links, and shared viewing are free. At 5,000, new records are refused clearly while everything else works, and batches report what was not added. | FR-15 |
| AC-33 | Synchronization and conflicts | Sessions, viewers, and preferences update automatically. Newer conflicting state is kept, both values are reported and preserved, and independent changes proceed. Pending or failed changes are never shown as saved. | FR-09 |
| AC-34 | Partial batches and retries | Independent successes are kept, dependents wait for confirmed prerequisites, and outcomes are reported by status. Retries never duplicate or overwrite. | FR-13.4–FR-13.5 |
| AC-35 | Connection loss | Lost connectivity is reported, input is kept, pending and unconfirmed changes are distinguished, and state is reconciled on reconnect. No offline guarantee. | Section 2.3, FR-09.3 |
| AC-36 | MCP clients | The same server works with Claude web, ChatGPT web, and Codex desktop. Read-only reads, searches, and inspects Trash. Manage collection applies ordinary changes without app approval. Gated operations need verifiable, scoped approval. | FR-10.1–FR-10.7 |
| AC-37 | App-only boundaries | MCP rejects permanent Trash removal, sharing management, account actions, export, and admission administration, even in Manage mode with approval. | X-03, FR-10.3 |
| AC-38 | Owner identification | The display name is optional for private use but required while sharing. Shared pages and invitations show it, never the email. Clearing it while sharing is rejected. | FR-07.3, FR-11.3 |
| AC-39 | Email change and recovery | Self-service changes verify both addresses. Recovery requires established ownership. Neither merges accounts nor recovers deleted data. | FR-11.4–FR-11.5 |
| AC-40 | Delete the account | A full-scope warning offers an export, then requires confirmation. Access, sharing, and MCP stop and all owned data is removed. Other owners are unaffected. Later sign-in recreates nothing. | FR-11.10–FR-11.11 |
| AC-41 | Export data | One archive containing a parseable versioned data file, a readable rendering, and a guide. It covers all albums (including Unsorted and Trash, marked), hierarchy, descriptions, memberships, field definitions, usage and values, and personal arrangements and choices. Empty, unused, and unknown are distinct. It contains no credentials, sharing data, others' content, or account profile, and reflects one point in time. | FR-08 |
| AC-42 | Browsers and accessibility | Desktop workflows are verified in Chrome, Edge, Firefox, and Safari, and mobile browsing in iOS Safari and Android Chrome. Keyboard and screen-reader walkthroughs pass, including guest views and failure states. | Section 2.2, Q-02–Q-03 |
| AC-43 | Performance and costs | Measurements at 5,000 owned albums plus the agreed shared workload meet the approved targets. Quotas are reviewed, and the creator checks operating costs, before admission expands. | Q-01, FR-15 |
| AC-44 | Recover the hosted service | Protected automated backups are in place. A documented restore drill meets the approved objectives, with no revived deletions or access, and backup deletion treatment is disclosed. | Q-04 |
| AC-45 | Reject hostile input | URL fetching and redirects, rendered content, authorization, secrets, and abuse limits are tested. Metadata and agent input cannot bypass permissions, approvals, or app-only rules. | Q-05 |
| AC-46 | Language and scope boundaries | The English UI preserves multilingual saved text. The service stays an online, creator-hosted album organizer with external playback. Exclusions hold, and listening fields stay manual. | Sections 2.3–2.6, FR-03.20 |

**Product evaluation.** Verify the creator's real workflows: saving, organizing, search, sharing, Trash recovery, export, and agents. Check usability and performance at the capacity limit, and review operating costs. Commercial adoption is not a release criterion.

## 8. Feasibility gates and risks

Resolve these gates before committing to the implementations they affect. Unrelated core work can proceed without implying that the full first-version promise has been validated.

**G1 Permitted metadata strategy (D3, D7).**

- For each launch service, validate the actual access path, costs, regional behavior, permitted storage, artwork and attribution rules, cross-service combination, and agent-visible and **exportable** data.
- Keep field-level source provenance wherever policy enforcement needs it, even after manual corrections or enrichment. Editing a provider-derived field does not lift its restrictions.
- Bring incompatible requirements back for a decision. Never bypass terms or silently disable a required service, MCP feature, or export field.
- **Experiment direction (17 October 2026).** MusicBrainz is the canonical metadata source. A pasted link is identified as follows:
  - MusicBrainz lookups;
  - Spotify's API, for identifiers only, with nothing Spotify-derived stored;
  - Apple's public lookup, as hints for a strict automatic MusicBrainz match;
  - otherwise, manual entry.

  It became the final decision on 21 October 2026 (below).
- **Terms review (19 October 2026)** ([memo](spikes/2026-10-19-g1-terms-review.md)). The creator decided:
  - Spotify's identifier bridge stays, as an accepted risk under strict rules: identifiers only, nothing kept, and an off switch. Spotify's terms bar transferring its data to other services, and they don't address identifier lookups;
  - service links are the user's own input, so they appear in MCP responses and the export, Spotify's included;
  - values the user confirms from Apple's hints are ordinary album data: saved, visible to agents, and exported;
  - Qobuz store pages may be read for an album's address and, transiently, for hints. Nothing from them is saved, and manual entry isn't prefilled from them;
  - Qobuz isn't asked for API keys: it doesn't grant them to individuals;
  - services are named in plain text, with no logos or badges (design spec).
- **Tidal (20 October 2026)** ([report](spikes/2026-10-20-g1-tidal.md)). Tidal became a launch service, and the creator decided:
  - Tidal links are identified by MusicBrainz's URL lookup and, transiently, by hints from tidal.com's album page, under Qobuz's rules. One request per pasted link, nothing from the page is saved, and manual entry isn't prefilled from it;
  - Tidal's API isn't used. Without Tidal's written approval, its developer terms forbid sending its data to another service, combining it with other services, and any use in connection with AI;
  - Tidal track links go to manual entry with the link kept (FR-02.3).
- **Final decision (21 October 2026).** After the M1 spikes, the creator closed G1:
  - **The chain is final.** A pasted link is identified by:
    1. MusicBrainz's URL lookup;
    2. the barcode bridge, for Spotify and Qobuz;
    3. hints for an automatic MusicBrainz match, from Apple's public lookup and from Qobuz's and Tidal's album pages;
    4. otherwise, manual entry.
  - **When a hint matches.** A hinted match is accepted only when exactly one official album or EP fits its title, artist and year; several go to confirmation (FR-02.9). Measured on real links, nothing was ever matched to a wrong album (tech spec TS-41).
  - **Agents.** Captures an agent starts never read Qobuz's or Tidal's pages, because both reject AI use (FR-10.5).
  - **Qobuz's store.** Qobuz links that name no store are looked up in the French store.
- **Qobuz track links (24 October 2026, TON-42).** Nothing permitted names a Qobuz track's album: Qobuz has no API for Tonaris, the terms review covers album pages only, and MusicBrainz links Qobuz albums, not tracks. The creator decided they go to manual entry with the link kept, like Tidal's (FR-02.3, AC-06).

**G2 Album matching (D2, D3).** Albums are identified, not editions (FR-02.12). Test real examples: remasters, deluxe editions, reissues, compilations, regional variants, identical titles, and track links. Each must resolve to the right album, and different albums with the same title must stay apart. Define the evidence for confident matches and when confirmation is needed; title/artist similarity alone is insufficient. Distinguish reissue dates from original-release and live-recording years. Chronology may need manual completion where providers lack it.

- **Decided (21 October 2026)** ([report](spikes/2026-10-19-g2-album-matching.md)).
  - **Identity.** An album is its MusicBrainz release group. Among 85 sets of same-title albums, this never merged two different albums, and none of 176 edition links reached a wrong album.
  - **Splits.** An album MusicBrainz keeps under two release groups stays two records, which a person can tidy. That is the safe failure.
  - **Similarity.** Title and artist similarity is never evidence: it would have merged different albums in 74 of the 85 sets.
  - **Changed ids.** When MusicBrainz merges release groups, Tonaris follows the merge. When it deletes one, the album keeps its data but is no longer identified.

**G3 MCP compatibility and verifiable approvals (D7).** Test one server with Claude web, ChatGPT web, and Codex desktop. Cover authentication, revocation, remote transport, scoped approvals, batches, and app-only restrictions. Choose an approval mechanism Tonaris can verify; an agent's claim that the user approved is not enough.

- **Verified, 21 October 2026** ([connection report](spikes/2026-10-21-g3-mcp-oauth.md), [approval report](spikes/2026-10-21-g3-approvals.md)). Claude web, ChatGPT web on a Plus plan, and Codex each:
  - connected, chose a permission mode and called tools;
  - lost access at once when the connection was revoked;
  - completed the approval round trip (FR-10.6).

  Claude also asked again when the scope grew after approval, and treated an album title written as an instruction as data. ChatGPT Plus allows custom servers and write actions.
- **Client prompts differ (FR-10.8).** Codex asks before any tool that isn't read-only, while ChatGPT Plus ran writes without asking under its default permission. Neither prompt replaces Tonaris's approval.

**Context and references.**

- *Practical precedent.* [MusicBox's help](https://marcosatanaka.com/support/musicbox/musicbox-help.html) documents album and song URL imports from Apple Music and Spotify. It does not disclose how metadata is retrieved, cover Qobuz, or establish permissions for web, MCP, or export use.
- *Spotify.* Development mode requires Premium for app owners and is capped at five authenticated users, and extended access is restrictive ([quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)). Catalog-only [client-credentials access](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow) still needs validation. The [Developer Policy](https://developer.spotify.com/policy) restricts ingesting Spotify content into AI models, integration with other services, and data transfer. Do not assume Spotify-derived metadata can be used in MCP responses, cross-service enrichment, or exports. The [album response](https://developer.spotify.com/documentation/web-api/reference/get-an-album) gives release dates with year, month, or day precision.
- *Apple Music.* Tonaris uses the public iTunes Lookup API, not the [Apple Music API](https://developer.apple.com/documentation/AppleMusicAPI), whose terms limit it to access to users' Apple Music subscriptions. Use, storage and redistribution were reviewed on 19 October 2026 (G1 terms review).
- *Tidal.* The [Developer Terms](https://developer.tidal.com/documentation/guidelines/guidelines-developer-terms), [Developer Guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-developer-guidelines) and [Design Guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-design-guidelines) (3.0, 6 May 2024) license non-commercial apps only. Without written approval they prohibit integrating with other services, transferring data to another service, and any use with AI, and they require Tidal's logo on its content. The consumer [terms](https://tidal.com/terms) also ban use in connection with AI.
- *Qobuz.* The public [API terms](https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf) require an issued key and date from 2011. Keys aren't granted to individuals: Qobuz's replies quoted in 2022 and 2026 say so, and its only channel is for partners (G1 terms review).
- Other metadata sources and manual enrichment merit evaluation. Neither is a confirmed substitute for capture from the launch services.

**Standing risks.**

- *Scope and cost.* The 5,000-album cap bounds collection size, but not accounts, traffic, artwork, provider calls, or bulk agent activity (FR-15.4).
- *Organizational complexity.* Nested folders, custom-field lifecycle, sharing inheritance, and Trash units drive design and test effort.
- *Album identity.* Automatic identification is not guaranteed, so manually entered and unidentified albums must stay fully usable.

## 9. Open decisions and pending approvals

D1–D8 are stable references from earlier iterations, not eight unanswered questions. Product behavior is settled in FR-01–FR-15. What remains:

| ID | Area | Remaining work |
| --- | --- | --- |
| D1 | Audience, admission, capacity | Resource limits approved on 17 October 2026 (TS-18). Budget and hosting are creator-owned (FR-15.5). |
| D2 | Identity, metadata, fields, chronology, grouping | Matching evidence validated and decided on 21 October 2026 (G2). Design defines controls, initial presentation, and group sequence. |
| D3 | Capture and enrichment | Terms decided on 19 October 2026, including artwork and export rights. Metadata strategy, link variants, store regions and album matching decided on 21 October 2026 (G1, G2). |
| D4 | Sharing | Design: access controls, exposure previews, invitation presentation. |
| D5 | Retention, Trash, export | Design and tech for FR-08 export. Import and restore are not planned. |
| D6 | Quality | Performance targets measured in M1 were approved on 21 October 2026. Search, MCP search, guest pages and export stay provisional until measured (Q-01). The test matrix is approved (Q-03). Backup retention, RPO/RTO, and historical-backup deletion treatment remain with the creator's hosting decisions (Q-04). |
| D7 | MCP | Permitted metadata in agent responses decided on 19 October 2026: all saved metadata and service links (G1). Client authorization and approval boundaries were verified on 21 October 2026 (G3). |
| D8 | Accounts and settings | Decided on 17 October 2026: admission invitations expire after 14 days, and account recovery relies on the creator's judgment, with a help page and contact address (TS-71, TS-73). |

Provider investigation may require new product decisions. Bring conflicts back here with evidence and options. Never replace required services, remove MCP access, expose private data, or invent integration guarantees through implementation choices.

## 10. Readiness and maintenance

- This baseline supports design, technical feasibility work, and delivery planning. It does not establish that all provider integrations are permitted. Investigate G1–G3 early.
- No **Pending approval** items remain. The performance targets were approved on 29 October 2026 (Q-01), and the backup objectives and historical-backup deletion treatment on 30 October 2026 (Q-04). Budget and hosting are creator-owned and are not tracked here.
- The design spec, tech spec, Linear issues, and OpenSpec changes reference rule IDs. OpenSpec capability specs grow change by change from these rules; this document is not bulk-converted.
- When evidence or a decision changes a promise, update this document first, add a change-log entry, and keep IDs stable.

## 11. Change log

**Iteration 6 — 17 October 2026** ([audit](audits/2026-10-17-requirements-audit.md))

- **Added data export.** FR-08 changed from "Future backup compatibility" to "Data export" (FR-08.1–FR-08.8). The export is a ZIP with a structured data file, a readable rendering, and a guide, and includes Trash and personal arrangements. Import and restore are now *not planned* rather than deferred, and viewer exports are not planned. Updated FR-03.5, FR-11.10, FR-11.13, G1, Q-04, Q-08, AC-37, and AC-41 to match.
- **Restructured** the document without changing agreed behavior:
  - added stable rule IDs (`FR-NN.M`, `X-`, `Q-`, `AC-`);
  - stated cross-cutting rules once (section 4) instead of repeating them in each FR;
  - consolidated the exclusions table;
  - made it about 40% shorter.
- **Moved** capacity from section 2 to new **FR-15**. Quality requirements are now Q-01–Q-10, acceptance checks AC-01–AC-46, and feasibility gates G1–G3 (formerly in the 13 October audit).
- **Decisions (17 October 2026):**
  - list names are now searchable (FR-12.4, AC-25);
  - rearranging (manual order) is desktop-only. Mobile browsers show the saved order and offer sort, direction, and grouping (section 2.2, FR-05.2);
  - the first version uses a dark theme only, with design tokens ready for a light theme later (Q-10);
  - singles and other release types outside the product categories are Unclassified (FR-05.9);
  - future native apps use the same service API as the web app (section 2.2).
- **Decisions (17 October 2026, second round):**
  - metadata experiment direction (G1): MusicBrainz is the canonical source. Links are identified through MusicBrainz lookups, Spotify's API for identifiers only, and Apple's public lookup as hints for a strict automatic match. FR-02.1 and FR-06.7 are clarified to match;
  - initial classification follows the canonical metadata source (FR-02.8, FR-05.9);
  - approving an agent's operation works on mobile (X-04);
  - resource limits approved (FR-15.4); budget and hosting are creator-owned (FR-15.5);
  - performance targets are provisional (Q-01); the test matrix is approved (Q-03).
- **Decisions (19 October 2026), during the G1 Apple spike** ([report](spikes/2026-10-19-g1-apple-hints.md)):
  - **albums, not editions** (new FR-02.12): a link to any edition identifies the album, with its canonical title and original release year. Edition details aren't captured in this version;
  - **retired FR-02.7** (edition enrichment), and with it the edition label in manual entry, editable metadata, export and search (FR-02.4, FR-03.1, FR-03.2, FR-08.3, FR-12.4);
  - matching, conflicts and capacity are per album: FR-01.7, FR-02.1, FR-02.3, FR-02.9, FR-06.8, FR-14.3, FR-14.4, FR-15.2, AC-09, AC-10, AC-14, AC-18 and AC-29 changed to match. G2 is now *Album matching*;
  - live albums keep their recording-year chronology (FR-05.5, FR-05.6 unchanged).
- **Decisions (19 October 2026), G1 terms review** ([memo](spikes/2026-10-19-g1-terms-review.md)):
  - Spotify's identifier bridge is kept as an accepted risk, under strict rules (G1);
  - service links, Spotify's included, appear in MCP responses and the export (G1, D7);
  - confirmed values from Apple's hints are saved, visible to agents and exported (G1, FR-08.8);
  - Qobuz store pages are read only transiently, and nothing from them is saved (G1);
  - Qobuz API keys aren't available to individuals; the "unverified" note is answered (section 8);
  - FR-08.8's open question is answered, and D3 and D7 are updated;
  - services are named in plain text, with no logos (design spec).
- **Decision (19 October 2026), during the G2 album-matching spike** ([report](spikes/2026-10-19-g2-album-matching.md)): a track link from a single adds the single (FR-02.3), as the compilation example already implied.
- **Decisions (20 October 2026), Tidal** ([report](spikes/2026-10-20-g1-tidal.md)):
  - Tidal is a fourth launch service (section 2, FR-02.1, AC-06);
  - it is identified by MusicBrainz's URL lookup and transient page hints; its API isn't used (G1);
  - Tidal track links go to manual entry with the link kept (FR-02.3, AC-06);
  - nothing from Tidal is saved (FR-08.8).
- **Decision (24 October 2026), Qobuz track links** (TON-42): they go to manual entry with the link kept, like Tidal's, as nothing permitted names their album (FR-02.3, AC-06, section 8).
- **Decision (24 October 2026), live singles** (TON-43): a single the canonical source also marks live or a compilation stays Unclassified, and isn't live (FR-05.9).
- **Decisions (21 October 2026), G1, G2 and Q-01**, from the M1 spike reports ([MusicBrainz](spikes/2026-10-18-g1-musicbrainz.md), [Apple](spikes/2026-10-19-g1-apple-hints.md), [Spotify](spikes/2026-10-19-g1-spotify-bridge.md), [Qobuz](spikes/2026-10-19-g1-qobuz-hints.md), [Tidal](spikes/2026-10-20-g1-tidal.md), [G2](spikes/2026-10-19-g2-album-matching.md), [Q-01](spikes/2026-10-21-q01-measurements.md)):
  - **G1 is closed.** The identification chain is final, and Qobuz links use page hints too. A hinted match needs exactly one official album or EP fitting its title, artist and year.
  - **Agents.** Captures an agent starts never read Qobuz's or Tidal's pages (FR-10.5).
  - **Qobuz's store.** Qobuz links without a store use the French one.
  - **G2 is closed.** Identity is the release group, and similarity never matches. Merged release groups are followed, and a deleted one leaves the album unidentified.
  - **Q-01.** The measured targets are approved, with viewer propagation on an estimate; the rest stay provisional (FR-09.5).
  - **Updated** section 2.5, FR-02's status, FR-09.5, FR-10.5, D2, D3 and D6.
- **Decisions (29 October 2026), M11** ([performance report](performance-verification.md)):
  - **Q-01.** The four provisional targets are approved as they stood, after measurements on the real app: quick search, MCP search, guest pages and export (TON-92). Updated Q-01, FR-12.6 and section 10.
  - **Limits.** Album titles and artist credits have a limit of 1,000 characters, set in TS-18 with the others (TON-95).
- **Decisions (30 October 2026), Q-04** (TON-97):
  - **Backups:** daily, kept 30 days, with a recovery point of 24 hours and a recovery time of 24 hours.
  - **Drills:** a restore drill every 3 months.
  - **Disclosure:** TS-114's wording, as written.
  - **Updated** Q-04 and section 10.
- **Decisions (30 October 2026), hosting and Q-04** (TON-108):
  - **Hosting:** Render, Frankfurt, for both services and Postgres, behind Cloudflare.
  - **Backups:** Render Postgres's point-in-time recovery replaces the daily encrypted off-site dump. It keeps 3 days on Render's Hobby plan and 7 on Pro, and loses at most a few minutes of changes. The recovery time and drills are unchanged.
  - **Disclosure:** TS-114's wording still holds, since backups now leave within 7 days at most.
  - **Updated** Q-04.
- **Decision (30 October 2026), an agent's details** (TON-111), from the creator's manual testing: details an agent sends for a link no step identified are matched like a store page's hints, so the album gets its MusicBrainz values and artwork. The app's manual entry still adds an album without a lookup (FR-02.4). **Updated** FR-10.5.
- **Clarifications** (no intended behavior change; flagged in the audit):
  - container names cannot be blank (X-06);
  - single-list deletion feedback is left to design, while folder deletion stays confirmed (FR-01.11);
  - unused option removal is an ordinary change in the app as well as MCP (FR-03.17);
  - Manage collection agents may change personal presentation, not only manual order (FR-10.4).
- **Retired text:** iteration 5's FR-08 compatibility clauses, its "retained direction" for imports, and the "deferred viewer exports" note in FR-07. No IDs were reused.

**Iteration 5 — 13 October 2026** ([audit](audits/2026-10-13-requirements-audit.md)). Product name, capture without a list, list moves, Unsorted and root presentation, creator admission administration, operator disaster recovery, informed sharing, same-service link conflicts, Trash units, and the guest search boundary.
