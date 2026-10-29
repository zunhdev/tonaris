# Tasks

## 1. Domain and database

- [x] 1.1 Add the `reference` change and bootstrap field, `share.saveLink` and `share.removeReference`, and reference changes from accept and leave, with their store methods (design decisions 1 to 3). Verify with domain tests:
  - save: new, again, a new link updating the same reference, a dead link, your own;
  - remove;
  - accept and leave log their changes;
  - `app_only` for MCP.
- [x] 1.2 Add `sharedWithMe` and the link state (design decision 4). Verify with db tests: via flags, availability, names hidden when unavailable, ordering.

## 2. API

- [x] 2.1 Add `GET /v1/shared` and `GET /v1/s/{token}/reference`, and regenerate OpenAPI. Verify with API tests:
  - saving adds one reference and no album;
  - the bootstrap and stream carry references;
  - removing an unavailable one;
  - a guest (no session) gets 401 from the reference state.

## 3. Web

- [x] 3.1 Add the references collection, `/shared` and the banner (design decisions 5 and 6). Verify with Playwright (`shared-with-me.e2e.ts`):
  - opening a link adds nothing;
  - Add to Shared with me, then "In Shared with me";
  - it shows on a second tab without reload;
  - leaving an invitation-based reference with its confirmation;
  - an unavailable one removed;
  - an axe check.

## 4. Docs

- [x] 4.1 Record DS-67, DS-68, TS-24 and the sync protocol as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
