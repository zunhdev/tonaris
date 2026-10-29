# Tasks

## 1. Domain and database

- [x] 1.1 Add the shared result schemas, and shared results to `searchCollection()` (design decisions 1 and 2). Verify with db tests:
  - an accepted invitation's content found, with its owner and root;
  - a saved link's found, an unsaved or pending one's not;
  - a private ancestor never named or matched;
  - an album's private lists left out;
  - Trash, revocation and moves followed.

## 2. API and MCP

- [x] 2.1 Answer `shared` from `GET /v1/search`, add shared albums to MCP's `search`, and regenerate OpenAPI (design decisions 2 and 3). Verify with API and MCP tests.

## 3. Web

- [x] 3.1 Add the palette's shared group (design decision 4). Verify with Playwright (`shared-search.e2e.ts`):
  - a shared list found with "Shared by Denis · Metal";
  - opening it shows the viewer page;
  - "private" finds nothing;
  - after a revoke it's gone;
  - an axe check.

## 4. Docs

- [x] 4.1 Record TS-50 and DS-75 as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
