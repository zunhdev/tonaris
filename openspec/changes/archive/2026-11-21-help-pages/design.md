# Design

## Context

- Public pages already render on the server (TS-03): `/welcome`, `/terms`, `/privacy`, `/help/recovery`. The CSP's `style-src` has a nonce and no `'unsafe-inline'`, so pages carry no `style` attributes.
- TON-308 takes Help's pictures from a demo collection of invented albums and saves WebP under `apps/web/src/help/pictures/`.
- The creator's picks are on the canvas "Tonaris Help look": 1A, 2A, 3A with 3C, 4A, 5A with 5C, and 6A.

## Goals / Non-Goals

**Goals:** a frame pages can be written into without touching code; Help readable on a computer and a phone, and by keyboard alone; links between pages that can't break silently.

**Non-Goals:** search (TON-314), the ways into Help (TON-315), the pages beyond Start here (TON-309 to TON-313), translations, a light theme.

## Decisions

### 1. MDX in the web app, with a generated page list

Pages are MDX files under `src/help/content/<section>/`. `@mdx-js/rollup` compiles them; their frontmatter is an export, and `rehype-slug` gives headings ids. `scripts/help-pages.ts` reads every page and picture and writes `src/help/pages.gen.ts`: metadata, headings with the same ids, a lazy loader per page, typed slugs and pictures with their shown size. It fails on a broken link, anchor, related page or picture, so the build does too. Vite runs it before a build and as pages change; a test checks the committed file is current.

Alternatives: `import.meta.glob` for the metadata (no typed slugs for the app's links, and an eager glob would pull every page into one chunk); Fumadocs or Starlight (their own look and CSP to fight, a second build).

### 2. Lazy content the server waits for

`/help/$` renders the page's content through `React.lazy` inside `Suspense`. The server's render waits, so the HTML is whole; in the browser, hydration keeps the server's HTML until the page's chunk arrives. The workspace bundle carries no page.

### 3. Steps are numbered lists; keys are a component

Pages stay plain Markdown: a numbered list renders as steps and bold as a label in the app. `<Keys k="⌘ K" />` shows keycaps; the server renders a Mac's, and the browser switches to Ctrl, Alt, Shift and Backspace off Apple's through `useSyncExternalStore`, which avoids a hydration mismatch. A screen reader hears each key's name.

### 4. The contents behave like the tree

The contents are disclosures and links, so Tab reaches them as usual, and one handler on the nav moves between rows with ↑ ↓ Home End and opens and closes sections with → ←, as the app's tree does.

## Risks / Trade-offs

- **The generated file can fall behind** a page edited outside Vite → the test fails, and any build rewrites it.
- **A Windows reader briefly sees ⌘** until the browser runs → acceptable; Help's text says "or press", so the meaning is clear meanwhile.
