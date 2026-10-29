# Tasks

## 1. Commands

- [x] 1.1 Add `share.leave` and `share.revoke`, and the store's `dropGrantReference` (design decisions 1 and 2). Verify with domain tests: leave withdraws only an accepted grant and drops a link-less reference; revoke is owner-only and works on pending and accepted; both are app-only.

## 2. API

- [x] 2.1 Regenerate OpenAPI. Verify with API tests for AC-23:
  - leaving keeps other people's access and a link path;
  - re-inviting after leaving starts pending;
  - Trash recovery doesn't revive a withdrawn or revoked grant;
  - revoking blocks only that path;
  - a reference through a link that is turned off and on again stays inaccessible.

## 3. Web

- [x] 3.1 Add the row menu with Remove access (design decision 3). Verify with Playwright, extending `invitations.e2e.ts`: the owner removes Anna's access, and her row and the content are gone.

## 4. Docs

- [x] 4.1 Record DS-65, TS-33 and the sync protocol as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
