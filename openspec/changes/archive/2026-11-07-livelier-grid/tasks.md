# Tasks

## 1. Tokens

- [x] 1.1 `tokens.css`: the tinted neutral ramp at hue 274, `violet-280` for `bg.selected`, and new tokens for the cover's edge and shadow and the label's ground and text; verified by `tokens.test.ts` with the new DS-12 values, all DS-14 pairs passing, and a new check of the label at 4.5:1 over a white cover
- [x] 1.2 `design-system.e2e.ts` probes the new `bg.app`; verified by the browser test

## 2. Covers

- [x] 2.1 `Artwork` draws the light edge over every cover, and the soft shadow when `raised`; cards, guest grids and the album panel pass `raised`; verified by a browser test reading a card's and a row's cover styles

## 3. Cards

- [x] 3.1 The open album's card has the accent ring and the title's highlight, and loses them when the inspector closes; verified by a browser test opening a card, opening another, and pressing Esc
- [x] 3.2 A card shows the raised surface under a hovering pointer, behind its content and taking no clicks; verified by a browser test that points at a card, checks the surface, clicks its Tidal link, and finds Tidal open and the inspector closed
- [x] 3.3 `releaseLabel` and the label on cards' covers and guest grids, with the words for assistive technology after the year; verified by unit tests for every type and live combination, and browser tests on a list's cards and a guest's grid

## 4. Phones

- [x] 4.1 On a phone, a list in Grid layout shows a live album's label, a tap on a card's link opens the service with no raised surface left behind, and the page is no wider than the screen; verified by a test in `mobile.e2e.ts` on the Pixel and iPhone profiles

## 5. Docs and checks

- [x] 5.1 DS-12, DS-16, DS-22 and DS-23 as built in TON-167
- [x] 5.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
