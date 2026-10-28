# Tasks

## 1. Domain, database and API

- [x] 1.1 Add the album limit, `countAlbums`, and the checks in `createAlbum` and capture's `create`; and the capture rate in the mutation runner with `capturesSince` (design decisions 1 and 2). Verify:
  - in `capacity.test.ts`: Trash counting, a new album refused with the reason, editing still working, the last slot, restoring at the limit;
  - in `capture.test.ts`: a new capture refused, and re-adding at the limit;
  - in the API's `capture.test.ts`: the 101st capture in an hour refused, and accepted an hour on.

## 2. Web

- [x] 2.1 Add Settings → Data with the meter, and the notices in capture and manual entry (design decisions 3 and 4). Verify with Playwright (`usage.e2e.ts`): "2 of 5,000 albums · 1 in Trash", the meter's value, and axe.

## 3. Docs

- [x] 3.1 Update DS-92, DS-98 and TS-18 as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check`.
