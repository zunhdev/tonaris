# Tasks

## 1. Domain and database

- [x] 1.1 Accept readable shared containers in `viewKindOf`, add `canReadShared`, and list shared folders' children in `viewItems` (design decision 1). Verify with domain tests: a viewer's `view.set` and `order.set` on a shared list apply to their own rows; someone without access is `not_found`.

## 2. API

- [x] 2.1 Add `GET /v1/shared/{id}` and its stream, and regenerate OpenAPI (design decision 2). Verify with API tests: a viewer's snapshot; 404 without access; the stream invalidates; a viewer's `view.set` leaves the owner's view as it was.

## 3. Web

- [x] 3.1 Add the viewer page, its presentation and manual order, the live re-read, and links from `/shared` (design decision 3). Verify with Playwright (`shared-viewing.e2e.ts`):
  - the pill and no edit controls;
  - sort by name kept after reload, while the owner's view is unchanged;
  - ⌥↑ in manual order;
  - an album the owner adds appears;
  - removed access shows "No longer available";
  - an axe check.

## 4. Docs

- [x] 4.1 Record DS-70 and the sync protocol as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
