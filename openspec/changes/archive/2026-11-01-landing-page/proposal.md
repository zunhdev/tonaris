# Proposal

Linear: TON-155 (Design). Design: DS-90, DS-32, DS-13, DS-120 (new). Done when a signed-out visit to `/` arrives at the server-rendered landing page, a signed-in visit still opens the last view, the page passes axe at desktop and phone widths, and the design spec records it as built.

## Why

TON-116's promo beside the sign-in card was deliberately barebones: a headline, a sentence and four features. Tonaris needs a proper landing page that says what it is, walks through the main flow and shows what sets it apart. Over two rounds of sketches the creator chose direction 1, "in the app's clothes", refined, with cover set 1, "Label series", for invented albums (1 November 2026).

## What Changes

- **Where it lives** (the creator decided, 1 November 2026): signed-out visitors to `/` go to `/welcome`, which the server renders. Signed-in people still go to their last view (DS-32).
- **The landing page** in the app's dark tokens: a sticky header, the hero, a picture of the workspace drawn from the app's own parts, How it works in four steps, What sets it apart (folders and lists, AI agents through MCP, sharing, export, speed), On your phone, a short row of smaller features, a closing Sign in, and a footer.
- **Ten invented albums** with covers drawn as inline SVG in one house style. No real artwork or artist names.
- **`/sign-in` is just the card again:** the promo goes, and the wordmark on pages for signed-out visitors (the sign-in frame and guest pages) leads to `/welcome`.
- **Landing type sizes** join DS-13's tokens: `hero`, `headline`, `lead` and `body`.

## Capabilities

### New Capabilities

- `landing-page`: the landing page, its sections and pictures, and the links to it.

### Modified Capabilities

- `app-shell`: the root path sends signed-out visitors to the landing page; the landing page is a public page rendered on the server.
- `accounts`: the sign-in page no longer shows the promo.

## Impact

- **`apps/web`:** `routes/welcome.tsx`; `features/landing/` (the page, its pictures, the covers and albums, the session-cookie check); `start.ts` (the redirect); `routes/_workspace.tsx`; `features/account/sign-in-card.tsx` and the sign-in-frame routes; the guest page's wordmark; `promo.tsx` and `e2e/promo.e2e.ts` go; `e2e/landing.e2e.ts`.
- **`packages/ui`:** `styles/tokens.css` and `styles/text-sizes.ts`.
- **Docs:** DS-13, DS-32, DS-72, DS-90, DS-120 (new), the design decisions log, and TS-03.
