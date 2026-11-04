# Proposal

Linear: TON-160 (Feature). Implements FR-06.3's links by hand (DS-46) and changes FR-02.1's paste anywhere (DS-48) while an album is open. Done when ⌘V with an album open in the inspector puts the pasted link in its service's row, with Undo, and a paste with the inspector closed still captures.

## Why

In the creator's manual testing (4 November 2026): a frequent workflow is creating lists and albums through MCP, then adding streaming links by hand, because an agent can't find Tidal links precisely. Each link took a click on the album, a trip to the panel's bottom-right corner for "Add Tidal link", and a paste. Meanwhile ⌘V, the quickest way in, captured the link as a new album even with an album open.

## What Changes

- **With an album open in the inspector,** on desktop, with no text field focused and no dialog, popover or menu open, ⌘V puts each pasted link in its service's row instead of capturing it (the creator decided this on 4 November 2026). The flow becomes: click the album, ⌘V.
- **Each link is checked as a typed one is** (TS-40). The service is the link's own. A link that can't be one, or two links for one service, send nothing and say why in a toast. A link the album already has changes nothing, and says so.
- **It is an edit:** it switches to Editing first, and offline it sends nothing and says so.
- **It says what it did, with Undo:** "Added the Tidal link", "Replaced the Spotify link". Undo takes the added link off or puts the replaced one back.
- **In Editing mode the Links section reads** "Paste a link to add it to this album."
- **With the inspector closed,** a paste captures as before. C and Add album capture with it open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: a paste captures only while no album is open in the inspector.
- `service-links`: a paste with an album open sets its links.

## Impact

- **`apps/web`:** a new `features/collection/pasted-links.ts` (the plan, unit-tested) and `paste-onto-album.ts` (the edit), `capture-context.tsx` (the paste goes to the open album first), `album-links.tsx` (the line); a browser test in `capture.e2e.ts`.
- **Docs:** DS-46 and DS-48 as built.
