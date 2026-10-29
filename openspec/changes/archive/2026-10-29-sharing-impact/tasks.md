# Tasks

## 1. Domain and database

- [x] 1.1 Add `sharing-impact.ts`: its types, the three functions and the answer's schema (design decision 1). Verify with domain tests:
  - into, out of and between shared folders;
  - another path kept;
  - pending people;
  - direct shares on descendants;
  - recovery to a shared folder;
  - an album's lists;
  - a fast-check property: anyone named as removed can't read the item after the move, and anyone named as added (accepted) couldn't before and can after.
- [x] 1.2 Add the db read of an owner's `ImpactState` and the answers for a move and a recovery. Verify with db tests.

## 2. API

- [x] 2.1 Add `GET /v1/sharing/impact`, and regenerate OpenAPI (design decision 2). Verify with API tests: a move's and a recovery's answers; someone else's item is 404; a destination inside the item is 422.

## 3. Web

- [x] 3.1 Add `SharingImpact` and its read, and show it in Move to…, the drag overlay and recovery (design decisions 3 and 4). Verify with Playwright (`sharing-impact.e2e.ts`):
  - Move to… shows "Newly visible to Anna" for a shared folder before moving;
  - restoring a shared list asks first, with "Still shared directly with Anna";
  - an unshared one restores at once;
  - an axe check.

## 4. Docs

- [x] 4.1 Record DS-69 and the API as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
