# Proposal

Linear: TON-167 (Design). Implements Q-10's experience direction for the dark theme (DS-12), FR-03.4's artwork (DS-23), and FR-05's album cards (DS-22), with FR-05.9's release types as labels, while keeping Q-02's contrast targets (DS-14). Done when the five picked variants look in the app as on the mock, on desktop and on a phone, a card's service links still open their service, and the contrast test passes with the new values.

## Why

In a design review on 7 November 2026, the creator found the app "a tad dry". Compared with Eagle, an asset manager laid out much like Tonaris, it has the same near-black theme but few cues: neutral graphite everywhere, flat covers, no sign of which card's album is open, cards that don't react to the pointer, and nothing on a cover saying what kind of release it is. The creator picked five variants from a switchable mock of their own list: 1B, 3B, 5A, 6A and 7A. TON-166 explores the other ideas.

## What Changes

- **1B, an indigo-tinted dark theme.** The neutral tokens (`bg.*`, `border.*`, `fg.*` but `fg.on-accent`) move from hue 265 at chroma 0.004 to 0.01, to hue 274 at about three times that chroma. `bg.selected` grows stronger, to 0.28 0.05 276, so a selected row still stands out. DS-14's targets still hold.
- **3B, covers with depth.** Every cover gets a faint light edge inside it. Covers in cards, on guest pages' grids, and in the album panel also cast a soft shadow. This is DS-16's first exception to "shadows only on floating layers".
- **5A, the open album shows in the grid.** The card of the album open in the album panel gets an accent ring around its cover, with a small gap, and its title sits on an accent highlight.
- **6A, hover.** Pointing at a card shows a raised surface behind its cover and text. Only on devices with a pointer that hovers: a tap on a phone leaves none behind. The surface takes no clicks, so a card's service links open their service as before.
- **7A, release labels.** A small label on a card's cover names a release that isn't a plain studio album: "EP", "Single", "Compilation", "Live", or a type with Live, such as "Compilation · Live". Albums, and albums of unknown type, get none. Guest pages' grids show them too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the neutrals lean toward the accent's hue; covers have an edge and, in cards and the album panel, a soft shadow.
- `views-and-ordering`: a card shows the album open in the inspector, reacts to a hovering pointer without getting in the way of its links, and labels releases that aren't plain studio albums.

## Impact

- **`packages/ui`:** `styles/tokens.css` (new neutral values, the cover edge and shadow, the label's ground) and `styles/tokens.test.ts` (the values, and the label's contrast over a white cover).
- **`apps/web`:** `features/collection/artwork.tsx` (the edge and the shadow), `album-cards.tsx` (the open album, the hover, the label), a release-label helper, `features/guest/share-content.tsx` (the label and the shadow on guest grids); browser tests in `open-in.e2e.ts`, `collection-views.e2e.ts`, `mobile.e2e.ts`, `design-system.e2e.ts`.
- **Docs:** DS-12, DS-16, DS-22 and DS-23 as built.
- No API, data or sync change.
