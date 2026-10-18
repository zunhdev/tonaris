# Tasks

## 1. Dependencies and project setup

- [x] 1.1 Add the pinned web dependencies to `apps/web`: TanStack Start and Router, Vite, the React plugin, React 19, Tailwind's Vite plugin, and the type packages. Verify that `bun install --frozen-lockfile` succeeds and that `bun.lock` resolves `@tanstack/start-server-core` ≥ 1.169.39.
- [x] 1.2 Add the pinned design-system dependencies to `packages/ui`: Base UI, `cn`, class-variance-authority, lucide-react, tw-animate-css, Tailwind, `@fontsource-variable/inter`, and `shadcn` as a devDependency. Give `packages/ui` the template's exports (`./globals.css`, `./components/*`, `./lib/*`) and both `components.json` files with style `base-nova`. Verify that `bun run check:workspace` passes.
- [x] 1.3 Configure TypeScript for both packages: DOM libs, `jsx: react-jsx`, Vite client types, the `@/*` and `@tonaris/ui/*` paths, and no `baseUrl`. Configure oxlint (`react` and `jsx-a11y` plugins; ignore `routeTree.gen.ts`) and oxfmt (ignore `routeTree.gen.ts`). Verify that `bun run typecheck` and `bun run lint` pass on the empty skeleton.

## 2. Design tokens and contrast

- [x] 2.1 Write `packages/ui/src/styles/tokens.css` with the three layers (design.md decision 3): primitives, dark semantic tokens with the tuned `border.strong` (0.52), `accent.fill` and `fg.on-accent`, the shadcn component tokens, and the `@theme` mappings for colors, the DS-13 type scale, DS-15 radii and DS-17 easings. Write `globals.css`, which imports Tailwind, tw-animate-css, `shadcn/tailwind.css`, Inter Variable and the tokens, sets the DS-13 font stack, and points `@source` at `apps/web`. Verify that `bun --bun vite build` produces CSS containing the semantic variables.
- [x] 2.2 Add the OKLCH-to-luminance helper with unit tests against known colors (white, black, sRGB red). Verify with `bun test packages/ui`.
- [x] 2.3 Add the token tests:
  - every DS-14 pair: text ≥ 4.5:1 on `bg.app`, `bg.panel`, `bg.raised` and `bg.hover`; `border.strong`, `focus` and `status.*` ≥ 3:1; `fg.on-accent` on `accent.fill` ≥ 4.5:1; a failure names the pair and its ratio;
  - semantic values equal the DS-12 table as tuned;
  - no file under `packages/ui/src/components` or `apps/web/src` references a primitive.

  Verify that `bun test packages/ui` passes, and that it fails when `border.strong` is set back to 0.32 (checked by hand).
- [x] 2.4 Update the design spec. In DS-12: `border.strong` 0.52, plus new rows for `accent.fill` and `fg.on-accent`, with the decision date. In DS-14: what the automated test covers. Verify by reading the diff against the creator's decisions in design.md.

## 3. Components

- [x] 3.1 Add Button, Separator and ScrollArea with `bunx shadcn@4.22.0 add … -c apps/web`, and remove the template's unused `React` import from ScrollArea. Size the Button variants to DS-15 (24, 28 and 32px), with the primary variant on `accent.fill` and `fg.on-accent`. Verify that `bun run typecheck` and `bun run lint` pass and that the components use only semantic or component tokens (the 2.3 test).

## 4. App, routes and shell

- [x] 4.1 Replace `src/placeholder.ts` with the Start app:
  - `vite.config.ts`;
  - `src/router.tsx`;
  - `src/routes/__root.tsx`, a document with `lang="en"`, `data-theme="dark"`, the globals stylesheet and the title "Tonaris".
  
  Keep `src/api.ts`. Point `dev`, `build` and `preview` at `bun --bun vite`. Verify that `bun dev` serves the web app on :3000 and the API on :3001.
- [x] 4.2 Add the rendering modes:
  - the pathless `_workspace` layout with `ssr: false` and `/c` under it;
  - the server-rendered `/sign-in` placeholder;
  - `/` redirecting to `/c`.
  
  Verify with `curl` on `bun run preview`: `/sign-in` HTML contains its heading, `/c` HTML doesn't contain the workspace content, and `/` redirects.
- [x] 4.3 Build the shell placeholder in `src/features/shell/` (design.md decision 6): a 240px sidebar `nav` with the wordmark and DS-31's sections as placeholders, a `main` with a page header, and no inspector space. Verify by eye in `bun dev`.

## 5. Browser tests

- [x] 5.1 Set up Playwright and axe-core in `apps/web`: `playwright.config.ts` with Chromium, a web server running `vite preview` after a build, and `*.e2e.ts` files. Add `test:e2e` scripts (`apps/web` and root), and add it to `bun run check`. Verify that `bun run test:e2e` runs an empty suite.
- [x] 5.2 Write the e2e tests for every browser-facing scenario:
  - **design-system:** each page is dark (`data-theme`, `color-scheme`, `bg.app` background) on `/c` and `/sign-in`; Inter Variable loads only from the app's origin; the computed font stack includes the system fallbacks.
  - **app-shell:** `/c` shows the sidebar, the wordmark and the main view with no inspector; the landmarks have accessible names; the server HTML for `/c` lacks the workspace content, and the content appears after the scripts run; the server HTML for `/sign-in` contains its heading; `/` lands on `/c`; axe finds no violations on `/c` and `/sign-in`.

  Verify that `bun run test:e2e` passes.

## 6. Docs and integration

- [x] 6.1 Update the README (web commands, `test:e2e`, the Node requirement for Playwright, the `packages/ui` layout and `shadcn add` usage), TS-05 (the web layout), TS-06 (`bun --bun vite`) and TS-132 (the `design-system` and `app-shell` capabilities). Verify that `openspec validate --all --strict` passes.
- [x] 6.2 Run `bun run check` (format, lint, typecheck, workspace, specs, db, openapi, unit tests and e2e). Verify that it passes, and that `bun dev` shows the dark shell at `/c` and the sign-in placeholder at `/sign-in`.

## Workflow follow-up

- After review, run `/opsx:archive` as the PR's last commit (TS-132). It creates `openspec/specs/design-system` and `openspec/specs/app-shell`.
- Note on TON-10 that Base UI injects a `<style>` element, which the CSP nonce must cover.
