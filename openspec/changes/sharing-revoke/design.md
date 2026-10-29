# Design

## Context

- **Grant statuses** move only through `moveGrant(id, from, to)`, which is conditional (TON-66).
- **Saved references** are `(viewer, container, link?)`. Accepting an invitation adds one with no link, or keeps an existing one.
- **Access resolution** reads accepted grants and live links only (TON-64). A revoked or withdrawn grant, or a revoked link, is never a source, so Trash recovery can't revive it.

## Goals / Non-Goals

**Goals:** leave, revoke, the dialog's Remove access, and AC-23's checks.

**Non-Goals:**
- the Shared with me view and its Leave share… entry (TON-68), which will call `share.leave`;
- saving a link to Shared with me (TON-68).

## Decisions

### 1. Leave by container

`share.leave` takes `{containerId}`, since a viewer knows the collection, not its grant.

1. Find the principal's accepted grant on that container; none is `not_found`.
2. Move it from accepted to withdrawn.
3. Drop their reference if its `link_id` is null (TS-33).

It runs under the viewer's lock, like accepting.

### 2. Revoke by grant

`share.revoke` takes `{grantId}`. The owner authorizes as for sharing (`shareable()`, even in Trash, as turning a link off does). It moves a pending or accepted grant to revoked; anything else is `not_found`.

The recipient's reference stays, so DS-67 can show it as no longer available.

### 3. The row menu

Each invitation row gets a "More" menu button with **Remove access**. It sends `share.revoke` and reads the dialog again.

## Risks / Trade-offs

- **[Leave from Shared with me needs TON-68's view]** → The command and its API tests land now; TON-68 wires the entry.

## Migration Plan

None.
