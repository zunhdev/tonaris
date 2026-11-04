# Design

## Context

- **Opening:** `useAlbumOpening` (`inspector-state.ts`) navigates to `?album=` on a click, or, in Editing mode with the inspector closed, after a 300 ms timer that a second click cancels. Rows and cards share it through `useAlbumGrid`, which knows the layout. Only rows have a double-click editor (`album-rows.tsx`).
- **The panel:** the shell renders `AlbumInspector` while `?album=` names an album, and gives it a grid column when it sits beside the view (1100 px and up). Below that it is fixed over the view, and on a phone it is a sheet from the bottom. The shell's grid clips on desktop (TON-158).
- **Artwork:** `Artwork` renders the image at opacity 0 and fades it in over 150 ms on `load`. Rows, cards and the inspector use the same proxy URL, which the API marks immutable for a week, so the inspector's copy is already in the browser's memory.
- **Motion so far:** the page fade (`page-fade.ts`, TON-140) uses Web Animations, skips Back, Forward and reduced motion, and learns about traversals from the router's history.

## Goals / Non-Goals

**Goals:** no wait where a double-click can't edit; the panel's slide as DS-17 lists it; cached artwork without a fade.

**Non-Goals:** animating the view's width, the panel's switch from one album to another, the panel's resize, or the album's own page (`/a/{id}`).

## Decisions

### 1. The wait depends on the layout

`useAlbumOpening` takes `doubleClickEdits`, which `useAlbumGrid` sets for rows. A click waits only when that, Editing mode and a closed inspector all hold. Cards also stop cancelling an open on the second click, so a double-click on a card opens it as one click does.

### 2. The shell keeps a closing panel until it has slid out

A hook in the shell (`inspector-slide.ts`) remembers the album whose `?album=` has just gone. The shell keeps rendering the panel for that album, inert, while it slides out, then drops it. The view's column goes at once, and a panel that sat beside the view becomes fixed at the window's right edge for its exit, so the view widens under it instead of after it.

- **Why not keep the column during the exit?** The view would then jump wider 200 ms after the key press. Widening at once makes Esc feel as quick as before.
- **Why not a library** (Base UI's transition status, Motion)? Neither fits a grid item whose presence is a search parameter; a few lines of Web Animations do, as the page fade does.

### 3. Web Animations, started before paint

The hook animates the panel element in a layout effect: `translateX(100%)` (`translateY(100%)` for the sheet) to none, 200 ms, enter easing; the reverse with exit easing and `fill: forwards` on closing, then the panel is dropped. Under `prefers-reduced-motion: reduce`, the keyframes are opacity 0 to 1 instead. A history traversal (BACK, FORWARD, GO, from the router's history) and a panel that is open when the shell first renders skip the slide. Reopening during an exit cancels it.

### 4. Artwork already complete shows at once

`Artwork` checks the image in a ref callback at commit: if it is `complete` with a natural width, it marks it shown without the fade, before the first paint. A later `load` doesn't bring the fade back. The inspector's image loads eagerly, since it is always in view.

## Risks / Trade-offs

- [A closing panel stays in the DOM for 200 ms] → it is `inert`, so it takes no clicks or focus; Playwright's assertions retry until it is gone.
- [A transform on the panel during the slide] → the panel's own fixed descendants would move with it; it has none (menus and dialogs are portalled).
- [Memory-cached images may not report `complete` at commit in every engine] → they then fade as before; the browser tests check Chromium and WebKit.
