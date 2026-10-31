# Proposal

Linear: TON-140 (Design). Design: DS-17, DS-30, DS-110. Done when a page switch fades the new page's content in while the header and sidebar stay still, and back, forward and reduced motion switch at once.

## Why

In the creator's manual testing (31 October 2026), the app felt quick but abrupt: a page switch swaps everything in one frame, with no motion at all. The creator asked for subtle motion on page switches, as Linear has, without slowing anything down.

## What Changes

- **A page switch fades the new page in:** what's below its header goes from transparent to opaque over 120 ms, with DS-17's enter easing. The old page goes at once, so nothing waits and two pages never overlap.
- **What stays the same stays still:** the sidebar, the page header with its title and controls, the Settings and Admin tabs, and the offline banner.
- **Not a page switch:** anything that keeps the path, such as opening an album.
- **At once:** back and forward, so nothing follows Safari's own swipe-back animation; and every switch under reduced motion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: motion covers page switches.

## Impact

- **`apps/web`:** the fade in the shell (`page-fade.ts`), `data-page-chrome` on the header, the tabs and the offline banner, a browser test, and the phone tests' axe check waits for the fade.
- **Docs:** DS-17 as built.
