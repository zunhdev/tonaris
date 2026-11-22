# Tasks

## 1. Dragging cards

- [x] 1.1 Drop targets say their axis; a card's side is the half of it, by width, the pointer is in; a dragged card's chip sits at the pointer
- [x] 1.2 Album cards drag from anywhere under Manual in Editing mode, and onto the person's lists in the sidebar in Editing mode, with a drop zone over half the gap while dragging, a line beside the card, and the dragged card faded
- [x] 1.3 Folder and list cards drag under Manual in Editing mode, onto cards and onto folders in the sidebar

## 2. Tests

- [x] 2.1 A browser test: an album card dragged onto the left half of the first card becomes first, announced, kept after a reload; a drop in the gap lands there; a click still opens the panel; in Viewing mode nothing moves
- [x] 2.2 A browser test: a list card dragged onto the right half of a folder card comes after it, at the root
- [x] 2.3 A browser test: an album card dragged onto a list in the sidebar, sorted by year, joins it

## 3. Help and docs

- [x] 3.1 Help: `organize/move-and-rearrange.mdx`, `organize/lists-in-and-out.mdx`, `organize/viewing-and-editing.mdx`
- [x] 3.2 DS-22, DS-41, DS-45, DS-49; the Help index regenerated
- [x] 3.3 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
