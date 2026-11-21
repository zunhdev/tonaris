# Tasks

## 1. Links

- [x] 1.1 `features/help/links.tsx`: typed page and heading, `openHelp`, `LearnMore`; a test that the types refuse a wrong page or heading

## 2. Ways in

- [x] 2.1 The landing page's header and footer; Terms · Privacy · Help under the sign-in card and on shared pages
- [x] 2.2 The account menu, on a computer and a phone, in a new tab
- [x] 2.3 Open help in ⌘K and the `?` sheet; "Search help for '…'" after a search's results
- [x] 2.4 "Learn more" in the sharing dialog, "Which album is this?", Custom fields, Connections, Export, Trash, Activity and an empty collection

## 3. Checks

- [x] 3.1 `e2e/help-ways-in.e2e.ts`: the landing page and sign-in to Help; the menu, ⌘K and Search help in a new tab; the `?` sheet's link; Learn more at Connections, Custom fields, Export and Trash; axe (all scenarios)
- [x] 3.2 Look at the links in place in a browser

## 4. Docs

- [x] 4.1 PRD FR-16.5 and its change log; DS-122; TS-136
- [x] 4.2 Run `bun run check`
