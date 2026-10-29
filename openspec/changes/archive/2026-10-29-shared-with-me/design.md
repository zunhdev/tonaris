# Design

## Context

- **`saved_references (viewer, container, link_id?)`.** Accepting an invitation (TON-66) upserts one with no link. Leaving (TON-67) drops a link-less one. Neither logs a change.
- **The sync protocol** carries the person's own data in their change log, and the bootstrap (TS-23, TS-24). Clients map changes per entity and ignore entities they don't hold.
- **Mutation arguments are never stored:** the mutations table keeps names and outcomes.
- **Access resolution** (TON-64) reads accepted grants and live links.

## Goals / Non-Goals

**Goals:** references in the sync protocol, save and remove, the list with availability, the banner, and `/shared`.

**Non-Goals:**
- opening shared content in the app, the sidebar's per-owner entries, and live availability (TON-69);
- shared content in search (TON-72);
- MCP's reference tools (M9).

## Decisions

### 1. The `reference` entity

- **The change:** `{entity: "reference", id: containerId, op, data: {containerId} | null}`. The bootstrap gains `references: [{containerId}]`, newest first.
- **What it carries:** only which collections the person keeps. Names, owners and availability depend on the owner's data, so they come from `GET /v1/shared` when the list is shown, on window focus, and after a reference change.
- **Who writes it:** `share.accept` logs an insert for a new reference; `share.leave` logs a delete when it drops one. Both under the viewer's lock.

### 2. Saving a link

**`share.saveLink {token}`:**
1. Hash the token in the command (`shareTokenHash` is the domain's).
2. Find the live link whose container is active (`findLinkByHash`). None: `not_found` with DS-72's sentence.
3. Refuse your own collection (`validation_failed`).
4. Upsert the reference with `link_id` = this link, replacing an older link's ID (FR-07.16: re-adding through the new link reuses the reference).
5. Log an insert, or an update when the reference existed.

It's app-only, so MCP can't save references until M9 decides. Guests have no principal.

### 3. Removing

**`share.removeReference {containerId}`** deletes the person's reference and logs the delete; `not_found` if there is none. It touches no grant: an accepted invitation still gives access. That's why the page offers Leave for invitation-based references.

### 4. The list

**`sharedWithMe(db, viewerId)`** joins references, containers and owners. For each:
- **`via`:** `invitation` when the viewer has an accepted grant on the container; `link` when the reference's link is live.
- **`available`:** whether the container is readable through some source (`readableContainers`).
- **`name` and `kind`** only while available, so a renamed or revoked collection reveals nothing new.

The order is owner display name, then name.

### 5. The banner

- **On the link page** (client-side only, since the page is public and server-rendered): the page asks `GET /v1/s/{token}/reference`. Not signed in (401): no banner.
- **Your own collection:** no banner.
- **Otherwise:** "Shared by {name} · Add to Shared with me", which sends `share.saveLink` and turns into "In Shared with me".

### 6. `/shared`

The route replaces the placeholder:
- **Groups** by owner, each reference with a glyph: people for invitation, link for link.
- **Dimmed** and "No longer available" when unavailable.
- **Actions:**
  - **Leave share…** for invitation-based ones, with an inline confirmation: "Leave "{name}"? {owner} would have to invite you again.";
  - **Remove from Shared with me** for link-only ones;
  - **Remove** when unavailable.
- **Re-reads** the list when the references collection changes.

## Risks / Trade-offs

- **[Availability is read, not pushed]** → It's re-read on view, focus and reference changes. TON-69 adds viewer invalidation.

## Migration Plan

None. The bootstrap and the change stream gain additive fields and a variant.
