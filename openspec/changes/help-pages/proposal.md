# Proposal

Linear: TON-307 (Design), the first issue of P-TON-58, Help and documentation. Adds FR-16.1 to FR-16.3 (decided 21 November 2026). Done when `/help` shows the home and the Start here pages in the creator's chosen look, on a computer and a phone, and axe finds nothing.

## Why

Before Tonaris leaves its closed beta, people need help they can use: pages organized by what they want to do, in plain words, reachable before they sign in. The creator chose to build Help into the web app (not a docs generator) and picked its look from a canvas of variants: 1A, 2A, 3A with 3C, 4A, 5A with 5C, and 6A. They asked for special attention to search (TON-314) and to the keyboard.

## What Changes

- **Help's frame:** `/help` and `/help/{section}/{page}`, rendered on the server, in the app's dark look: a skip link, the header, the contents in a sidebar on a computer and in a sheet on a phone, On this page, Related, Previous and Next.
- **The home (1A):** "New here?" and every section as a tile. Search joins it in TON-314.
- **Page parts (4A):** steps, keys as the reader's computer names them, notes, pictures with a text alternative, two choices side by side.
- **The keyboard:** every step names its key; the contents move by arrows like the app's tree; Help works by keyboard alone.
- **The pipeline:** MDX pages, a generated page list with typed slugs that checks links and pictures, pictures from TON-308's run.
- **The Start here pages:** What Tonaris is, Your first ten minutes, Joining and signing in.
- **Nothing links to Help yet**; TON-315 adds the ways in.

## Capabilities

### New Capabilities

- `help-pages`: Help's pages, their frame, their parts and how they're kept in step with the app.

### Modified Capabilities

None.

## Impact

- **`apps/web`:** `vite.config.ts` (MDX), `scripts/help-pages.ts` and its test, `src/help/` (sections, content, pictures, the generated list), `src/features/help/`, routes `help.index.tsx` and `help.$.tsx`, `e2e/help.e2e.ts`; MDX build dependencies.
- **Repository:** oxfmt and oxlint skip `pages.gen.ts`.
- **Docs:** PRD FR-16 and its change log; DS-122, DS-32, the design decisions log; TS-136.
