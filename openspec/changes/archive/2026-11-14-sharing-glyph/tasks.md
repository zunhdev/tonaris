## 1. What the person shares

- [x] 1.1 `ownSharing` in the database, with a test: open invitations and live links, none in Trash, only the person's own.
- [x] 1.2 `GET /v1/sharing`, with a test, in the API document.

## 2. The glyph

- [x] 2.1 A store that reads it when a glyph shows, after the sharing dialog's changes, and when the window is shown again.
- [x] 2.2 `SharingGlyph` in the tree, folder rows and folder cards, dimmer when inherited, with words for screen readers.

## 3. Words and tests

- [x] 3.1 DS-27, DS-31 and DS-41 record it as built.
- [x] 3.2 A browser test: a link turned on shows on the folder, dimmer on its list, nothing elsewhere, and after a reload.
