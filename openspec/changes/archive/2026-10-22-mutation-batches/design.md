# Design

## Context

- **Single mutations are complete** since TON-20, TON-26 and TON-27. `executeMutation` (`packages/db/src/sync.ts`) runs one envelope in one transaction:
  - it takes the owner's `account_sync` row lock;
  - it replays a stored outcome for a known `mutationId`, and refuses one too old to have a record (`expired`);
  - it runs the command, logs its changes at gapless `seq`s, and stores the outcome.

  Copies of a mutation that arrive together wait for the lock and then replay.
- **The route** (`apps/api/src/sync/routes.ts`) validates the body against `mutationSchema`, a discriminated union, so a malformed envelope is a 422 for the whole request. It publishes the changes to the hub after commit.
- **TS-27 already has `skipped`**, as `{status: "skipped", dependsOn, because: failed | skipped | pending}`. Nothing produces it yet.
- **The web client** sends single mutations from its outbox, and treats `skipped` as settled (`writer.ts`).
- **OpenAPI:** Elysia generates the request body from the route's `body` schema, and a `detail.requestBody` can't replace it (checked with a probe). The document is otherwise post-processed in `apps/api/src/openapi.ts`, which also adds stand-alone components.

## Goals / Non-Goals

**Goals:**
- FR-13.4's batch rules in one place in the domain, testable without a database, and reused by MCP's batch tools in M9.
- No change to the single-mutation contract or its behavior.

**Non-Goals:**
- **Client batching.** The outbox learns to send batches and reconcile them in TON-30; the report is TON-32.
- **Dependencies across requests.** An item depends only on earlier items of its batch. Across requests, the outbox's order already gives causality (TS-22).
- **Producers of `needs_input` and `needs_approval`.** They arrive with matching and recovery (M3, M5) and MCP approvals (M9). The skip rule handles them already.
- **Album capacity** (TON-60). Batches check whatever each command checks.
- **`docs/api/sync-protocol.md`** (TS-28). It is written once the stream and client store are final (TON-29, TON-30); the OpenAPI document carries the contract meanwhile.

## Decisions

### 1. A separate endpoint, `POST /v1/batches`

- TS-20 planned one endpoint taking "a single mutation or a batch". That would turn its request and response into unions, so every generated client would have to tell the two apart, for the one shape it sent.
- A separate route keeps each request and response one shape, and is a pure addition to `/v1` (TS-09). TS-20 is updated to say so.
- `GET /v1/mutations/{id}` keeps answering for each item that ran, since items are stored as mutations.

### 2. The envelope

```ts
type Batch = { batchId: string; items: (Mutation & { dependsOn?: string[] })[] }; // 1–200 items
type BatchResult = { batchId: string; items: MutationResult[] };                  // same order
```

- `batchId` is a client UUIDv7 that names the batch in its answer, as `mutationId` names an item. It isn't stored: idempotency lives in each item's `mutationId`.
- The answer is always 200 with every item's outcome. A failed item is an outcome, not an HTTP error.

### 3. What is validated as a whole, and what per item

The batch's frame is checked as a whole:
- `batchId` is a v7 UUID;
- there are 1–200 items;
- each item has a v7 `mutationId`, and no two share one.

Failing any of these is a 422 problem, like a malformed single mutation, because without IDs there is nothing to report outcomes against.

Everything else is per item:
- the envelope against `mutationSchema`;
- `dependsOn` naming earlier items.

A bad item gets `failed` with `validation_failed`, with paths relative to the item (`args.title`), and its dependents are skipped. That is FR-13.4: valid changes apply even when others fail.

*OpenAPI:* the route's body schema has to be the loose frame, or Elysia would reject a whole batch for one bad item. The document therefore describes items as "a `BatchItem`, validated on its own", and `openapi.ts` adds the strict `BatchItem` schema as a component, so generated clients can type what they send.

*Alternative:* validate the whole batch strictly, as the single endpoint does. That gives a stricter document, but one malformed item, such as a year out of range in a pasted import, would stop every valid one.

### 4. Execution: `runBatch` in the domain, `executeBatch` in the database layer

`runBatch(batch, run)` in `packages/domain/src/batches.ts` walks the items in order:

1. Parse the item with `batchItemSchema`. If it doesn't parse, it fails as invalid.
2. Check that every `dependsOn` names an earlier item of the batch. If not, it fails as invalid.
3. Find the first prerequisite whose outcome isn't `confirmed`. If there is one, the item is skipped with `{dependsOn: <that id>, because: <its status>}`.
4. Otherwise call `run(mutation)`, the mutation without `dependsOn`, and record the outcome.

`executeBatch(db, principal, batch, {onExecuted})` in `packages/db/src/sync.ts` passes `executeMutation` as `run`:

- Each item is its own transaction, taking and releasing the owner's lock (TS-25).
- Other writes may interleave between items. They are judged in order like any write, so a dependent can meet a conflict that a session made in between. That is correct.
- `onExecuted(changes)` is called after each item commits, so the route publishes each item's changes at once, rather than holding the whole batch's changes for its last item (FR-09.5).

*Why the domain:* the rules are pure, and MCP's batch tools (M9) need exactly the same skipping and reporting.

### 5. `because` is the prerequisite's own status

- `because` widens to `failed | conflict | skipped | needs_input | needs_approval | pending`.
  - A conflict isn't a failure (TS-27), and FR-13.4 names "awaits input or approval" separately.
  - `pending` stays for a prerequisite still in progress, such as a capture waiting on a provider (M3).
- Only the first unmet prerequisite is named. The client finds its full outcome by `mutationId` in the same answer.
- *Alternative:* map everything that isn't confirmed to `failed`. That keeps the enum, but loses the reason DS-84 groups items by.

### 6. Skipped and invalid items aren't stored

- An item that never ran has no outcome record.
- Sending the same item again, with the same `mutationId`, runs it then, if its prerequisite now succeeds. This is how "inputs for unfinished work are preserved" (FR-13.4) works without a new ID.
- A stored `skipped` would replay forever.
- A batch sent again replays every item that ran, and judges the rest afresh. Sent again unchanged, a skipped item is skipped again, because its prerequisite replays the same failure.

### 7. The batch size

`maxBatchItems = 200` in `limits.ts`, for every client: decided 22 October 2026, and the same as TS-66's MCP limit. MCP's batch tools will use the same constant.

## Risks / Trade-offs

- **The `because` enum grows in a response.** oasdiff may flag `response-property-enum-value-added`. → TS-27's vocabulary is a contract that clients must tolerate growing (TS-09), and TON-26 treated a new `oneOf` member the same way. If CI flags it as an error, it is set to `warn` in `oasdiff-levels.txt`, with the reason.
- **Loose items in the OpenAPI body.** → The `BatchItem` component and the description carry the real shape. The domain schemas stay the source for TypeScript clients.
- **A 200-item batch holds the lock 200 times in a row.** Other sessions' writes wait at most one item, not the whole batch. → Acceptable; each item is a few queries.
- **A half-finished batch on a crash.** → Each item's commit stands on its own. The client sends the batch again (TS-22), and only the unfinished items run.

## Migration Plan

No schema change. Deploying adds a route, a component and enum values, and rolling back removes them. Outcomes stored by batch items are ordinary mutation records, which the previous version still replays.
