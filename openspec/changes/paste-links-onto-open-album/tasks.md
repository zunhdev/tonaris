# Tasks

## 1. The paste

- [x] 1.1 `pastedLinks` plans a paste onto an album: each link to its service's row, replacing the album's, refusing a link that can't be one and two for one service, and nothing for the album's own links; verified by unit tests
- [x] 1.2 `usePasteOntoAlbum` sets the planned links on the open album, switching to Editing, with an Undo toast and an announcement, and an info toast for a refusal or offline; `usePasteCapture` asks it first; verified by a browser test: Viewing mode, a Tidal link added, a Spotify link replaced and undone, a playlist refused, and a capture with the inspector closed

## 2. The hint

- [x] 2.1 The Links section reads "Paste a link to add it to this album." in Editing mode; verified by the browser test

## 3. Docs and checks

- [x] 3.1 DS-46 and DS-48 as built
- [x] 3.2 `bun run check` passes, and a native `bun run build`
