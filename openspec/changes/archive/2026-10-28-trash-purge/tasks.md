# Tasks

## 1. Domain and database

- [x] 1.1 Add `purgeUnit`, `trash.purge`, the tombstone union and the store's purge methods, and `purgeExpiredTrash` (design decisions 1 to 4). Verify:
  - in the domain's `trash.test.ts`: a list purged (albums kept, a list tombstone, `list_deleted` on restore), an album purged (links and values out, an album tombstone), and app-only;
  - in Postgres: an early purge's cascade, and expiry purging only expired units, logged without a mutation.

## 2. API and web

- [x] 2.1 Add the `trash-expiry` schedule with the hub, the client's purge, descriptions, retries and dependencies, and regenerate the OpenAPI document (design decisions 3 and 5). Verify with `schedules.test.ts` (it purges and publishes) and `sync.test.ts` (a purge reaching another session).

## 3. Docs

- [x] 3.1 Update TS-13, TS-91 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
