# Design

## Context

- **Paste capture:** `usePasteCapture` (`capture-context.tsx`) listens for `paste` on the document. On desktop, with no text field focused and no layer open, it captures the paste's lines that look like links (`linksIn`) into the list on view.
- **The inspector's links:** `album-links.tsx` adds, replaces and removes a link through the sync client's `links` collection, checked by `checkLink`, which reads the link with the server's own parser (`parseLink`). The stream replaces a link as typed with its canonical URL.
- **The open album:** `?album=`, through `useInspector`. `useCollectionData().albumsById` holds the owner's albums.

## Goals / Non-Goals

**Goals:** one keystroke to add a link to the open album; the same checks and save states as a typed link; Undo.

**Non-Goals:** pasting onto a focused row with the inspector closed, pasting on phones (read-only), or finding links for the person.

## Decisions

### 1. The paste goes to the open album first

The one paste listener asks `usePasteOntoAlbum` first, which answers whether an owned album is open; only if not does it capture. One listener keeps the conditions (desktop, no text field, no layer) in one place.

- **Why not a separate listener?** Two listeners would race over `preventDefault`, and capture would need to know about the inspector anyway.

### 2. A pure plan, then the edit

`pastedLinks` (pure, unit-tested) turns the pasted lines and the album's links into a plan: save these links, each replacing the album's link for its service if it has one; refuse, with a reason; or nothing to change. The service comes from the link (`parseLink`), so there's no field to choose. A link equal to the album's canonical one is no change. The paste is all or nothing, as a typed link is.

- **The URL sent is the one pasted,** as the field sends it, for the server to make canonical; a short link passes for the server to follow.

### 3. Toasts rather than the row

The Links section can be below the fold, so the paste says what it did in an Undo toast ("Added the Tidal link"), announced with the album's title. A refusal is an info toast with the reason. Undo deletes an added link and writes a replaced one's URL back.

## Risks / Trade-offs

- **A paste meant as a new album** now lands on the open album. Undo takes it back, and C or Add album captures with the panel open.
