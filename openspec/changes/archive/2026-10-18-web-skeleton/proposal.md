# Proposal

Linear: TON-7 (Design). Implements Q-02 and Q-10 through DS-10–DS-20 and DS-30, and the rendering split in TS-03. It implements no FR rules directly; the shell and route modes are the frame later FR work (M2-08 onward) fills in.

## Why

`apps/web` is still a Bun placeholder page. Sign-in (TON-9), the security baseline (TON-10), production builds (TON-12) and every M2 screen need the real TanStack Start app, built on the design system's tokens, so that the first real screens are dark, legible and consistent from day one (Q-10), and the contrast targets (Q-02, DS-14) are checked by a test rather than by eye.

## What Changes

- Replace the placeholder with a TanStack Start app (≥ 1.169.x, which includes the CVE-2026-102989 fix) in `apps/web`, run by `bun dev` on port 3000 (TS-06).
- Set up shadcn (CLI v4, TanStack Start template) on Base UI primitives and Tailwind v4, with the copied components owned by `packages/ui` (TS-05).
- Define the three token layers (DS-10) for the dark theme (DS-11): primitive OKLCH ramps, semantic tokens (`bg.*`, `fg.*`, `border.*`, `accent.*`, `status.*`, `focus`), and component tokens that map onto shadcn's variables.
- Tune two DS-12 starting values against DS-14, as decided by the creator on 18 October 2026:
  - `border.strong` rises from L 0.32 to 0.52, so input borders reach 3:1 on every surface;
  - new `accent.fill` (0.54 0.17 275) for primary button backgrounds and new `fg.on-accent` (near white) for their labels (5.0:1), while `accent.solid` stays 0.66 for the focus ring and selection marks.
- Add an automated contrast test that reads the token file and enforces DS-14.
- Self-host Inter Variable with the DS-13 fallback stack and type scale.
- Render a placeholder of the three-pane desktop shell (DS-30): sidebar, main view, inspector slot, built from tokens and Base UI components.
- Establish both rendering modes (TS-03): the signed-in workspace routes are client-only (`ssr: false`), and public routes (here `/sign-in`, a placeholder that TON-9 completes) are server-rendered. `/` redirects to `/c`.
- Keep the Eden API client from TON-6 (`apps/web/src/api.ts`).

## Capabilities

### New Capabilities

- `design-system`: the visual foundation every screen uses: dark theme, token layers, typography, contrast targets and the base component layer (DS-10–DS-20; Q-02, Q-10).
- `app-shell`: the frame of the web app: the three-pane desktop shell, the route map and which routes render on the server or only in the browser (DS-30–DS-32; TS-03).

### Modified Capabilities

None.

## Impact

- **Code:** `apps/web` (Start app, routes, shell), `packages/ui` (tokens, global CSS, shadcn components, `cn`), tooling for the contrast test.
- **Dependencies:** `@tanstack/react-start`, `@tanstack/react-router`, Vite and its React plugin, React 19, Tailwind v4, Base UI, shadcn's runtime helpers (`class-variance-authority`, `clsx`, `tailwind-merge`), `lucide-react`, `@fontsource-variable/inter`. All pinned exactly (TS-07).
- **Docs:** DS-12 (tuned values and the two new tokens), DS-14 (what the test covers), TS-132 (the two new capabilities), README (web commands).
- **Later issues:** TON-9 builds the sign-in page in the SSR route; TON-10 adds the CSP nonce to the Start document; TON-12 wraps the production build in `Bun.serve`.
