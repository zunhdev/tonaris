# Tasks

## 1. Domain and database

- [x] 1.1 Replace the random token with `shareToken(secret, linkId)`, and update TON-64's tests (design decision 1). Verify with bun tests: 43 characters, stable for a link, different across links and secrets.
- [x] 1.2 Add `invited_email`, the store's sharing and account methods (db and memory), the two error codes, and the three commands (design decisions 2 and 4). Verify with domain tests:
  - invite: pending, member only, not yourself, display name required, no duplicate, `app_only` for MCP;
  - link on, kept, off, new on again;
  - display name: cleared only when not sharing.
- [x] 1.3 Add `shareSettings()` (design decision 3). Verify through the API tests, which read it back: invitations, the link, inherited counts and links, and someone else's container.

## 2. API

- [x] 2.1 Add `GET /v1/containers/{id}/sharing`, prepare the link hash for `share.setLink`, and regenerate OpenAPI. Verify with API tests:
  - invite and read back;
  - `recipient_not_found`;
  - the link URL's token opens the link (`findShareLink`), and turning off kills it;
  - display name clear refused while sharing;
  - 404 for another account's container;
  - request schemas unchanged apart from added mutations.

## 3. Web

- [x] 3.1 Add the dialog, the header button, ⇧S, the palette command and the reference entry (design decisions 5 and 6). Verify with Playwright (`sharing-dialog.e2e.ts`):
  - the display-name prompt, then invite;
  - the unregistered error keeping the address;
  - folder disclosures;
  - the link on, Copy, and off with its confirmation;
  - inherited access;
  - ⇧S;
  - an axe check.

## 4. Docs

- [x] 4.1 Record DS-65, TS-32 (derived tokens and rotation), TS-34, `docs/deploy.md` and the sync protocol's new mutations as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI request comparison with main.

## Workflow follow-up

- Archive the change as the PR's last commit.
