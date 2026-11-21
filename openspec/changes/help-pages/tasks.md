# Tasks

## 1. The pipeline

- [x] 1.1 MDX in `vite.config.ts`, with GFM, frontmatter and heading ids; `mdx` types
- [x] 1.2 `src/help/sections.ts`: sections in order, with colors and icons
- [x] 1.3 `scripts/help-pages.ts`: the page list with headings, loaders, typed slugs and pictures; it fails on broken links, anchors, related pages and pictures; Vite runs it; `help-pages.test.ts` checks the committed file

## 2. The frame and the parts

- [x] 2.1 The frame: skip link, header with Sign in or Open Tonaris, footer
- [x] 2.2 The contents: sidebar on a computer, sheet on a phone, keys like the tree
- [x] 2.3 The home (1A) and a page (2A): section, title, answer, Needs a computer, On this page, Related, Previous and Next
- [x] 2.4 The parts (4A): steps, keys as the computer names them, notes, pictures, choices
- [x] 2.5 Routes `/help` and `/help/$`, rendered on the server; 404 for an unknown page

## 3. The first pages

- [x] 3.1 What Tonaris is, Your first ten minutes, Joining and signing in, with TON-308's pictures

## 4. Checks

- [x] 4.1 `e2e/help.e2e.ts`: every page rendered on the server, the home to a page, On this page, Next, keys off a Mac, the skip link and the contents by keyboard, the phone's sheet and width, Not found, axe at both widths (all scenarios)
- [x] 4.2 Look at the pages in a browser at desktop and phone widths

## 5. Docs

- [x] 5.1 PRD FR-16 and its change log; DS-122, DS-32 and the design decisions log; TS-136
- [x] 5.2 Run `bun run check`
