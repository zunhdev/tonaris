# Proposal

Linear: TON-68 (Feature). Implements FR-07.13, with FR-07.7's leave in the app. Design: DS-67, DS-68. Done when AC-24 passes.

## Why

Accepting an invitation saves a reference (TON-66), but nobody can see their references, save a link's collection, or remove one. FR-07.13 wants link shares saved only by an explicit action, references synchronized across the person's devices, and removable even once inaccessible.

## What Changes

- **References sync** (FR-07.13, TS-24):
  - The bootstrap gains `references`: the person's saved folders and lists, by container.
  - The change log gains the `reference` entity, written by accepting, saving a link, removing and leaving.
  - The web client holds them in a collection, so another device sees the change within the sync target.
- **`share.saveLink {token}`** (DS-68), by a signed-in person, app-only:
  - saves the link's folder or list to their references, or points an existing reference at this link. It never duplicates and copies nothing;
  - a link that doesn't work answers DS-72's sentence; your own collection is refused.
  - The token travels in the request body, which is never stored (TS-32).
- **`share.removeReference {containerId}`:** removes a reference whether or not it is still accessible. It revokes no grant, and other paths stay.
- **`GET /v1/shared`:** the person's references with:
  - the owner's display name;
  - the folder's or list's name and kind, while accessible;
  - whether it came by invitation or by link;
  - whether it is available now.
- **`GET /v1/s/{token}/reference`**, signed in: whether this link's collection is in the person's references, and whether it's their own.
- **The link page's banner** (DS-68), for signed-in visitors: "Shared by {name} · **Add to Shared with me**", then "In Shared with me". Opening the link adds nothing.
- **`/shared`** (DS-67):
  - references grouped by owner display name;
  - distinct glyphs for invitation and link;
  - unavailable ones dimmed with "No longer available" and **Remove**;
  - **Leave share…**, with a confirmation that the owner must invite you again, for invitation-based ones;
  - **Remove from Shared with me** for link-saved ones.
- **Accepting from the inbox** no longer needs a reload to show in Shared with me.

Opening a shared folder or list in the app, the sidebar's per-owner entries and live availability come with TON-69.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: people keep references to shared content, synchronized and removable.

## Impact

- **`packages/domain`:** the `reference` change, bootstrap's `references`, the two mutations, and changes from accept and leave.
- **`packages/db`:**
  - the store methods;
  - the bootstrap;
  - the list;
  - the link state.
- **`apps/api`:** two routes, and OpenAPI (a change variant, a bootstrap field, two mutations, two paths).
- **`apps/web`:** the references collection, `/shared`, and the banner.
- **No schema change.**
