# Tasks

## 1. API

- [x] 1.1 Add `GET /v1/s/{token}` and its stream, the hub's watch and notify, notifications for change-less writes, and log redaction (design decisions 1 and 2). Verify with API tests:
  - the snapshot with signed artwork;
  - 404 for unknown, revoked and trashed links;
  - the stream sends `shared-invalidate` after an album is added and after the display name changes;
  - a 500's logged path hides the token.

## 2. Web

- [x] 2.1 Add the server-rendered page, navigation, Open, visit-only view options, the live re-read, previews and narrow layout (design decision 3). Verify with Playwright (`guest.e2e.ts`):
  - the server sends the albums' names in the HTML;
  - folder to list;
  - Open's link attributes;
  - sorting kept on reload and not saved;
  - an album added by the owner appears;
  - turning the link off shows the unavailable sentence;
  - preview meta;
  - an axe check.

## 3. Measure

- [x] 3.1 Measure mobile LCP once (design decision 4), and record it in TS-120. Verify it is within 2.5 s.

## 4. Docs

- [x] 4.1 Record DS-72, TS-03, TS-23, TS-32, `docs/deploy.md` and the sync protocol as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
