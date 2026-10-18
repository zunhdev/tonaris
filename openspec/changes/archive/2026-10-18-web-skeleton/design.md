# Design

## Context

- `apps/web` is a Bun placeholder page (`src/placeholder.ts`) plus the Eden client from TON-6 (`src/api.ts`). `packages/ui` is an empty package. See proposal.md for why this changes now.
- The installs are isolated (`bunfig.toml`): a package resolves only what it declares. Tooling is oxlint, oxfmt and TypeScript 7 (`tsc`, no compiler API). Everything is pinned exactly (TS-07).
- Probed on 18 October 2026 in a scratch directory, with `shadcn` 4.22.0, `@tanstack/react-start` 1.169.3 (which pins `start-server-core` 1.169.44, past the CVE fix in 1.169.39), Vite 8.3.4 and Bun 1.4.3:
  - Dev, build and preview all work under `bun --bun vite`.
  - No package in the stack loads the TypeScript compiler API.
  - `shadcn init` clones a template, installs, and runs `git init` with its own commit.
  - The components shadcn generates import `cn` from the new `cn` package and Base UI from `@base-ui/react/<part>`. The template's CSS imports `shadcn/tailwind.css` from the `shadcn` package.
- Creator decisions of 18 October 2026: the capabilities are `design-system` and `app-shell`; `border.strong` becomes L 0.52; primary buttons use a new `accent.fill` (0.54 0.17 275) with `fg.on-accent` labels.

## Goals / Non-Goals

**Goals:**

- One token source, `packages/ui/src/styles/tokens.css`, that the app, the shadcn components and the contrast test all read.
- Both rendering modes from TS-03 are in place and covered by tests, so TON-9 (sign-in) and M2 only add routes.
- Every spec scenario is backed by a test: unit tests for the tokens, Playwright for anything that needs a browser.

**Non-Goals:**

- Real sidebar contents, the collection tree, sidebar resizing and collapse, the inspector, and the command palette: M2-08 and later.
- The CSP nonce in the Start document: TON-10.
- The production `Bun.serve` wrapper and the Docker image: TON-12. This change builds and previews only.
- Browser calls to the API, which need CORS and cookies: TON-9 and TON-10.
- Components the shell doesn't use. Each later screen adds what it needs with `shadcn add`.

## Decisions

**1. Assemble the app from shadcn's monorepo template instead of scaffolding into the repo.**

- `shadcn init --monorepo` would create its own git repo, a turbo setup, ESLint and Prettier configs, `"latest"` TanStack versions and `legacy-peer-deps`. All of that conflicts with the repo's tooling and pinning.
- Instead, copy the template's structure:
  - `apps/web`: Vite config, `src/router.tsx`, `src/routes/`, a `components.json` pointing at the UI package.
  - `packages/ui`: `components.json`, `src/styles/`, `src/components/`, `src/lib/`.
- Pin every dependency, then add components with `bunx shadcn@4.22.0 add <name> -c apps/web`, which writes them into `packages/ui/src/components`.
- `shadcn` itself is a pinned devDependency of `packages/ui`: it provides the CLI and the build-time `@import "shadcn/tailwind.css"`.
- **Alternative:** run `shadcn init` inside the existing packages. That works too, but it rewrites the CSS and still assumes Geist, so the result would need the same cleanup.

**2. Style `base-nova`, with Inter instead of Geist.**

- Nova's compact sizing (32px default buttons) is closest to DS-15's 28 and 32px controls. Vega would bring Inter but 36px controls.
- The font comes from `@fontsource-variable/inter`, so the woff2 file is bundled into the app's own assets (DS-13, served by the app itself). The fallback stack is DS-13's.

**3. Three token layers in one CSS file** (DS-10):

- **Primitives** on `:root`: OKLCH ramps named by role and lightness, such as `--gray-155: oklch(0.155 0.006 265)` and `--violet-660`, plus durations, easings, the floating shadow, and DS-18's `--z-*` layers.
- **Semantic tokens** on `[data-theme="dark"]`: `--bg-app`, `--fg-tertiary`, `--border-strong`, `--accent-fill`, `--fg-on-accent`, `--status-danger`, `--focus` and so on. Each refers only to a primitive.
  - `--focus` is `accent.solid`.
  - `accent.soft` is `accent.solid` at 12% alpha.
  - A light theme would add `[data-theme="light"]` with the same names (DS-11).
- **Component tokens**: shadcn's variables, mapped onto semantic tokens. For example, `--background` is `bg.panel`, `--primary` is `accent.fill`, `--ring` is `focus`, `--input` is `border.strong`, and `--accent` (shadcn's hover surface) is `bg.hover`.
- **`@theme inline`** exposes the semantic tokens as Tailwind colors, named after DS:
  - `bg.panel` gives `bg-panel`;
  - `border.subtle` gives `border-subtle`;
  - `fg.primary` gives `text-fg-primary` (the prefix stays, because `primary` is shadcn's);
  - `accent.solid` gives `bg-accent-solid`;
  - `status.danger` gives `text-status-danger`.
- **`@theme`** replaces Tailwind's type scale with DS-13's (`--text-*: initial`, then `micro` to `display`), its radii with DS-15's (4, 6, 8, 12), and adds DS-17's easings.
- **Alternative:** only shadcn's variable names. That loses the DS vocabulary that design reviews and the contrast test use.

**4. The contrast test reads the CSS file.**

- A Bun unit test in `packages/ui` parses `tokens.css`, resolves each semantic token to its primitive, and converts OKLCH to linear sRGB with the OKLab matrices. It then computes WCAG relative luminance and checks every DS-14 pair; alpha tokens are composited over their background first.
- The converter is about 20 lines and is checked against known colors: white, black and sRGB red. That avoids a color-library dependency.
- A failing pair is reported with both token names and the measured ratio.
- The same file is parsed to check that the semantic values match DS-12 as tuned, and that components never reference primitives.

**5. Rendering modes through a pathless layout.**

- `src/routes/_workspace.tsx` sets `ssr: false`. In Start 1.169 a child can only be as restrictive as its parent, so every workspace route under it is client-only. On those routes the server sends the document shell (`<html data-theme="dark">`, head, styles) and the layout's pending fallback. Probed: the child isn't even matched on the server.
- Public routes (`/sign-in` now; guest, admission and approval pages later) sit outside the layout and keep the default SSR.
- `/` redirects to `/c` in `beforeLoad`, on the server or in the client.
- **Alternative:** `defaultSsr: false` in `createStart`. It fails closed, but each SSR page must then opt in on the root route too, which makes the root's own setting misleading.

**6. The shell is a CSS grid in `apps/web/src/features/shell/`.**

- Columns: sidebar 240px, main `1fr`, inspector 380px rendered only when open.
- Landmarks: `<nav aria-label="Sidebar">`, `<main>`, and later `<aside aria-label="Inspector">`.
- The sidebar shows the wordmark and placeholder sections in DS-31's order. The main view shows a page header.
- Tokens only, no primitives.

**7. Tooling fits the repo's stack.**

- Scripts:
  - `dev`: `bun --bun vite dev --port 3000 --strictPort` (TS-06)
  - `build`: `bun --bun vite build`
  - `preview`: `bun --bun vite preview --port 3000`
- `src/routeTree.gen.ts` is generated by the router plugin and committed, so `tsc` works without a build. oxlint and oxfmt ignore it.
- `apps/web/tsconfig.json` adds the DOM libs, `jsx: react-jsx`, `types: ["vite/client", "bun"]`, and the `@/*` path that Vite resolves with `resolve.tsconfigPaths`.
- `packages/ui` exports `./globals.css`, `./components/*` and `./lib/*`, like the template. Its own files reach each other through a `@tonaris/ui/*` path in its tsconfig.
- oxlint enables its `react` and `jsx-a11y` plugins for the TSX code (Q-02).
- The template's ESLint and Prettier setup isn't carried over.

**8. Browser checks use Playwright with axe** (TS-121).

- `apps/web/e2e/*.e2e.ts` runs Chromium against `vite preview` of a fresh build.
- It covers the dark document, the font's origin, the shell's landmarks, which routes are server-rendered, and the redirect. axe-core finds no violations on `/c` and `/sign-in`.
- The `.e2e.ts` suffix keeps the files out of `bun test`. `bun run test:e2e` runs them, and `bun run check` includes it.
- Playwright's runner needs Node. The locally installed Chromium is reused, and CI installs it (TON-11).

## Risks / Trade-offs

- **[Start, Base UI and the `cn` package are new]** → Everything is pinned, components are copied into the repo, and the e2e suite covers the routing behavior that matters.
- **[Base UI injects a `<style>` element at runtime]** → TON-10's CSP needs to allow it with the nonce. Recorded on TON-10.
- **[`routeTree.gen.ts` can go stale]** → The router plugin regenerates it on every dev run and build. A stale file shows up as a `tsc` error or as a diff after `bun run build`. A dedicated CI check can follow in TON-11.
- **[Playwright adds a Node requirement to `bun run check`]** → Node ≥ 20.19 is already needed for the OpenSpec hook. The README says so.
- **[`border.strong` at L 0.52 makes input borders more visible than DS-12's start]** → This was the creator's decision for DS-14 compliance. Dividers keep `border.subtle`.

## Migration Plan

No data or deploy migration. `bun dev` keeps its ports, and the placeholder page and its `API_INTERNAL_URL` demo are removed: the Eden client stays in `src/api.ts` for the routes that will use it. Rollback is reverting the PR.
