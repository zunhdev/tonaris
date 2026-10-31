# Proposal

Linear: TON-124 (Design). Implements FR-03.4. Design: DS-23, DS-30, DS-46. Done when the artwork fills the panel, the panel resizes, and Find sits beside the Artwork URL.

## Why

In the creator's manual testing (31 October 2026), the album panel's artwork was a fixed 240 px, the panel couldn't be widened, and "Find artwork" was a filled button under the URL field while the space beside the field stayed empty.

## What Changes

- **The artwork fills the panel's width,** up to 500 px, the size of the covers Find brings (`front-500`).
- **The panel's left edge resizes it,** as the sidebar's right edge does: dragged, or focused and moved with ← and →, Home and End. The width runs from 320 to 560 px, 380 by default, kept on the device, beside the view and over it alike.
- **"Find artwork" becomes "Find",** a ghost button to the right of the Artwork URL field, in the panel and in the manual entry form. It is still named "Find artwork" for assistive technology.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the album inspector can be resized.
- `album-records`: the inspector's artwork fills its width; Find sits beside the Artwork URL.

## Impact

- **`apps/web`:**
  - `resize-handle.tsx`, the sidebar's splitter, now shared;
  - `device.ts` (`inspectorLayout`, `clampWidth` with limits), `shell.tsx`, `shell-context.ts` (`inspectorWidth`), `inspector.tsx`, `album-cards.tsx`;
  - `album-details.tsx`, `find-artwork.tsx`, `new-album.tsx` (`TextField`'s `action`);
  - `e2e/album-inspector.e2e.ts`, `e2e/artwork.e2e.ts`.
- **Docs:** DS-30 and DS-46 as built.
