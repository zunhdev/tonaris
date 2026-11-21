# Proposal

Linear: TON-315 (Feature), part of P-TON-58, Help and documentation. Adds FR-16.5 (decided 21 November 2026). Done when each way in opens the right Help page, and each "Learn more" opens the section it's about.

## Why

Help is finished and searchable, but nothing links to it. People look for help where they already are: the landing page before they join, sign-in when they're stuck, the account menu or ⌘K inside the app, and the moment something on screen gives them pause.

## What Changes

- **Before signing in:** Help in the landing page's header, at every width, and in its footer; Terms · Privacy · Help under the sign-in card and on shared pages.
- **Inside the app, in a new tab:** Help in the account menu, on a computer and a phone; Open help in ⌘K, which also offers "Search help for '…'" after a search's results; a link from the `?` sheet to Help's Keyboard shortcuts.
- **"Learn more" where people hesitate:** the sharing dialog, "Which album is this?", Custom fields, Connections, Export, Trash, Activity, and an empty collection.
- **Links that can't break:** the app names a Help page and heading by type, so renaming one in Help fails type-checking until the links follow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `help-pages`: Help's ways in, and checked links into it from the app.
- `landing-page`: the landing page leads to Help.

## Impact

- **`apps/web`:** `features/help/links.tsx` and its test; the account menu, the shortcut sheet, the command list and its runner, the app's search palette; the landing page, `FooterLinks` (was `LegalLinks`); the sharing dialog, the decision card, Custom fields, Connections, Export, Trash, Activity and the empty collection; `e2e/help-ways-in.e2e.ts` and its account; `search.e2e.ts`; `search.gen.json` for the new command.
- **Docs:** PRD FR-16.5 and its change log; DS-122; TS-136.
