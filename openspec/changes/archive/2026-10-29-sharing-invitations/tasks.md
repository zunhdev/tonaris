# Tasks

## 1. Domain and database

- [x] 1.1 Add the `share-invitation` template, `emailing` on invite, and the `share.resendInvitation`, `share.accept` and `share.decline` commands, with their store methods (design decisions 1 and 2). Verify with domain tests:
  - invite and resend mark `sending`;
  - accept grants, upserts the reference and is idempotent;
  - decline;
  - someone else's, or an unavailable invitation, is `not_found`;
  - `app_only` for MCP.
- [x] 1.2 Add the db reads and writes: invitation lists and states, delivery details, status recording, and the `unknown` reading (design decisions 1 and 3). Verify with db tests through the commands.

## 2. API

- [x] 2.1 Deliver in the runner, and add the two routes (design decisions 1 and 3). Verify with API tests:
  - an invitation emails the recipient's current address through the test port, and records `sent`;
  - a failing port records `failed`, and Resend sends again;
  - a replay sends nothing;
  - inbox and page states for the recipient, another account and a declined one;
  - accept gives read access (`canReadContainer`).

## 3. Web

- [x] 3.1 Add the routes, the sidebar item and the dialog's delivery states (design decision 4). Verify with Playwright (`invitations.e2e.ts`):
  - Denis invites Anna, and the email arrives in Mailpit;
  - Anna's sidebar shows 1, and she accepts from the email link;
  - she declines another from the inbox;
  - the wrong account and unavailable states;
  - the owner's dialog shows "sent";
  - an axe check.

## 4. Docs

- [x] 4.1 Record DS-31, DS-65, DS-66, TS-33, TS-72 and the sync protocol as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
