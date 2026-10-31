# Design

## Context

The workspace's pages render inside the shell's `<main>` (DS-30), each as a fragment: the page header, on Settings and Admin the tabs, then the page's content. The offline banner tops `<main>` (DS-81). The collection is already in the browser (TS-23), so a page switch renders in one frame.

## Decisions

### 1. Fade in only, opacity only

The new page fades in and the old one goes at once. A crossfade would overlap two album lists for a moment, which reads as muddy and makes the switch feel slower. Opacity only, so nothing moves. 120 ms with `--ease-enter`, whose curve is front-loaded: the page is mostly there within a few frames.

### 2. What fades

`<main>`'s children, except those marked `data-page-chrome`: the page header (both its desktop and phone forms), the Settings and Admin tabs, and the offline banner. They are the same from page to page, so fading them would read as a blink. Marking them, rather than matching `header` and `nav`, keeps the phone's "More" links, which belong to the page, in the fade.

### 3. Web Animations, started when the router has rendered

`usePageFade` listens for the router's `onRendered`, which comes after the new page has committed and before the browser paints it (the same moment scroll restoration uses), so the page never shows at full opacity first. When the path changed, it calls `element.animate` on each child that fades, with the ID `page-fade`. A new switch cancels the fades still running, so quick switching never stacks them. Nothing blocks clicks, and no library is added.

Rejected: the View Transitions API (the router's `defaultViewTransition`). It snapshots the page and covers it while it animates, needs scoping to keep the sidebar still, and can follow Safari's swipe-back with a second animation.

### 4. At once on back and forward, and under reduced motion

The router's history says what kind each navigation was. After a `BACK`, `FORWARD` or `GO`, the page shows at once, and any fade still running is cancelled. Under `prefers-reduced-motion: reduce`, pages switch at once: DS-17 allows opacity-only or instant, and page switches are frequent enough to leave still.

### 5. Tests

A Chromium test slows the page's animations a thousandfold through the DevTools protocol, so it can look at the fade under way: the list fading below its header, with the header at full opacity and nothing fading elsewhere; then back, and a switch under reduced motion, with no fade. The phone tests' axe check first waits out a `page-fade`, as `violations()` already waits for animations, so contrast is never measured mid-fade.
