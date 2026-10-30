# Tasks

## 1. The setting

- [x] 1.1 Domain: `linkTargets`, `accountDefaultsSchema`, `appAccountDefaults`, `setLinkTarget` and the `defaults.setLinkTarget` mutation. The stream's and bootstrap's defaults carry `linkTarget` (design decisions 1, 2). Verified by `packages/domain/src/views.test.ts`.
- [x] 1.2 Database: `account_settings.link_target` with its migration. The store and the bootstrap read it, and the export doesn't (design decision 1). Verified by `packages/db/src/sync.test.ts`.
- [x] 1.3 OpenAPI regenerated. Every existing request variant is byte-identical to `main`'s; only `defaults.setLinkTarget` is added. Checked with a JSON diff, and by CI's oasdiff on the PR.
- [x] 1.4 Web client: `defaultsWrites()`, resubmit, dependencies, and the descriptions and conflict labels (design decision 2). Verified by `client/sync/views.test.ts` and `features/sync/describe.test.ts`.

## 2. Links

- [x] 2.1 Settings → Preferences → Links, "Open links in": Web page or App (DS-94). Verified by `e2e/open-in.e2e.ts`.
- [x] 2.2 `ServiceAnchor` and `ServiceChoices` in the chooser, the phone sheet, the inspector's Links and the shared pages' popover. TON-47's App choice and focus watch removed (design decision 3). Verified by `e2e/open-in.e2e.ts`, `e2e/service-links.e2e.ts` and `e2e/guest.e2e.ts`.

## 3. Tests and docs

- [x] 3.1 `e2e/open-in.e2e.ts`: by default the chooser's links open the pages. With App set, the inspector and the chooser open the apps after a reload. The phone sheet keeps the pages by default.
- [x] 3.2 Record FR-06.6 and AC-18 in the PRD, the walkthrough's AC-18, and DS-25, DS-46, DS-94 and TS-43 as built.
- [x] 3.3 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Push before archiving, so CI's oasdiff judges the API change.
- Archive the change as the PR's last commit.
- TON-105 reuses `ServiceAnchor` for cards and rows.
