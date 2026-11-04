# Tasks

## 1. Opening without the wait

- [x] 1.1 `useAlbumOpening` waits only for rows in Editing mode, with `doubleClickEdits` from `useAlbumGrid`; verified by a browser test: a double-click on a card in Editing mode opens the inspector, and one on a row's title edits it with the inspector closed

## 2. The slide

- [x] 2.1 `inspector-slide.ts`: the leaving album, the slide in and out with DS-17's durations and easings, reduced motion's fade, and no slide on traversals or a panel open at load; the shell keeps the closing panel, inert and fixed, until it has slid out; verified by browser tests that record the panel's animations on opening, on Esc, under reduced motion and after a reload

## 3. Artwork

- [x] 3.1 `Artwork` shows an image that is already complete without the fade, and the inspector's loads eagerly; verified by a browser test: a row's artwork shows in the inspector with no transition

## 4. Docs and checks

- [x] 4.1 DS-17, DS-23 and DS-46 as built
- [x] 4.2 `bun run check` passes, and a native `bun run build`
