# Proposal

Linear: TON-28 (Feature). Implements FR-09.4 (conflicts), FR-13.3 (truthful outcomes), FR-13.4 (batches) and FR-13.5 (safe retries), with the batch size of FR-15.4. Tech: TS-20, TS-21, TS-22, TS-25, TS-27. Covers the server side of AC-33 and AC-34. The client outbox that sends batches and reconciles them is TON-30, and the batch report on screen is TON-32.

## Why

`POST /v1/mutations` runs one mutation at a time, with TON-20's idempotency, compare-and-set and per-account lock. Several flows send many changes at once:
- adding a selection to a list;
- batch capture (M3);
- recovery from Trash (M5);
- MCP tools that take lists of albums (M9).

FR-13.4 asks that their valid parts apply even when others fail, that dependent steps wait for confirmed prerequisites, and that each item reports its own outcome. Nothing in the API does that yet.

## What Changes

- **A new endpoint, `POST /v1/batches`**, takes `{batchId, items}`: up to 200 mutation envelopes, each optionally naming earlier items it `dependsOn`. It answers `{batchId, items: [{mutationId, outcome}]}`, in the order sent.
- **Items run in order, each on its own** (TS-25): one transaction under the owner's write lock, through the same path as a single mutation. A success stays committed whatever happens to later items, and its changes reach the stream as soon as it commits.
- **Dependencies:** an item runs only if every item it depends on is `confirmed`. Otherwise it is `skipped`, naming the prerequisite and that prerequisite's outcome: `failed`, `conflict`, `skipped`, `needs_input` or `needs_approval`. Its own dependents are skipped in turn.
- **Each item is validated on its own** (FR-13.4). An item that isn't a valid envelope, or that depends on anything but an earlier item, gets a `failed` outcome with `validation_failed`, and the rest still run. Only a batch the server can't read item by item is refused as a whole, with a 422 problem: no items, more than 200, or a missing or repeated `mutationId`.
- **Retries:** every item keeps its `mutationId` idempotency. A batch sent again applies nothing twice: items already run replay their outcomes, and the rest run now. Skipped and invalid items aren't recorded, so the same item can be sent again once its prerequisite is fixed.
- **TS-27's `skipped` outcome** gains `conflict`, `needs_input` and `needs_approval` as reasons (**contract addition**: a response enum grows, which clients must tolerate under TS-09).
- **Batch size:** 200 items for every batch, from the app, native clients or MCP (TS-18, decided 22 October 2026).
- **Single mutations are unchanged.** This change adds API tests for two cases TON-20 didn't cover there: two sessions saving the same field at once, and several copies of a mutation arriving together.
- **Specs:** TS-20 (the batch endpoint), TS-25 (the rules above), TS-27 (the `skipped` reasons) and TS-18 (the batch size).

## Capabilities

### New Capabilities

- `sync-and-conflicts`: how writes are judged and answered:
  - conflicts from stale values;
  - one truthful outcome per write;
  - batches with dependencies;
  - retries that never apply twice.

  The change stream, bootstrap and client store (TON-29, TON-30) add to it later.

### Modified Capabilities

None.

## Impact

- **Domain** (`packages/domain`):
  - batch schemas and `runBatch`, the per-item validation and dependency logic, in a new `batches.ts`;
  - `maxBatchItems` in `limits.ts`;
  - the wider `skipped` reasons in `outcomes.ts`.
- **Database** (`packages/db/src/sync.ts`): `executeBatch`, running `runBatch` over `executeMutation`.
- **API** (`apps/api/src/sync/routes.ts`): the `POST /v1/batches` route, publishing each item's changes as it commits. The OpenAPI document gains the route, a `BatchItem` component and the wider enum. All additions.
- **Web:** unchanged. The client keeps sending single mutations until its outbox learns batches (TON-30).
- **MCP:** unchanged until M9 moves its tools onto batches.
