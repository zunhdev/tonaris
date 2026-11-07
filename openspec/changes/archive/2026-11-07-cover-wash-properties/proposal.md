# Proposal

Linear: TON-173 (Design). Implements Q-10's experience direction in the album inspector (DS-46), with FR-03.4's artwork as its source of color and DS-14's contrast targets kept. Done when the panel's top takes its cover's color, its read-only facts gather under Properties, and thin lines divide its sections, in Viewing and Editing mode and in the phone's sheet.

## Why

From TON-166's mock (7 November 2026), the creator picked 14B, a wash of the cover's color at the panel's top, and 15C, a Properties block with dividers. The panel was a plain column of sections, the same for every album.

## What Changes

- **The cover's wash (14B).** The panel's top takes the cover's main hue, at a fixed lightness (0.21) and chroma capped at 0.08, fading out 28rem down, behind the content. Text keeps 4.5:1 on it for every hue, a field's placeholder included. The hue is read in the browser from the image the proxy serves, apart from the shown `<img>`. It fades in once read; a cover read before shows at once. No artwork, no wash.
- **Properties (15A).** The read-only facts gather at the end, labels left, values right: in Viewing mode the release type, live, the years and which year sorts (no separate Chronology section there); then Added, In lists and Links. It replaces Info.
- **Dividers (15B).** A thin line above each section.
- **The image proxy** already lets the web app's origin read an image (the API's CORS, with `Vary: Origin`); a test now pins it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: the inspector's wash, Properties and dividers.

## Impact

- **`packages/ui`:** a new `lib/wash.ts` (`washColor`), and its contrast test in `styles/tokens.test.ts`.
- **`apps/web`:** new `features/collection/cover-color.ts` and `cover-wash.tsx`; `album-details.tsx` (the wash, Chronology in Editing mode only, Properties, dividers). Tests: `cover-color.test.ts`, `album-inspector.e2e.ts`, `mobile.e2e.ts`.
- **`apps/api`:** a test in `img/artwork.test.ts`; no code change.
- **Docs:** DS-46 as built.
