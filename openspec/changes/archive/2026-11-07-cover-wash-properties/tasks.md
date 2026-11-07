# Tasks

## 1. The wash

- [x] 1.1 `washColor` in `packages/ui`; verified by the token test: every text color at 4.5:1 on the wash, plain and in a field, for 72 hues
- [x] 1.2 `coverColor` and `dominantColor`; verified by unit tests: the OKLCH conversion, a cover's color over a plain ground, no chroma for black and white, transparent pixels skipped
- [x] 1.3 The image proxy answers the web app's origin with CORS and `Vary: Origin`, and not other origins; verified by a test in `img/artwork.test.ts`
- [x] 1.4 `CoverWash` in the inspector: the cover's hue at the top, none without artwork; verified by a browser test with the fixture's green cover and an album without artwork

## 2. Properties and dividers

- [x] 2.1 Properties replaces Info, with the chronology in Viewing mode; Chronology shows in Editing mode only; a line above each section; verified by a browser test in both modes, axe on the panel, and the phone's sheet

## 3. Docs and checks

- [x] 3.1 DS-46 as built in TON-173
- [x] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
