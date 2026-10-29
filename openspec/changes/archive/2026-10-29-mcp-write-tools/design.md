# Design

## Context

- **The app's write path:**
  - `POST /v1/batches` runs envelopes through `mutationRunner`, which prepares captures, link edits and share links first;
  - `executeBatch` applies TS-25's rules;
  - `announce` hands changes to the hub.
- **The mutation IDs** are UUIDv7s whose timestamp TS-22's retention judges: a replay older than 30 days is `expired`.
- **`runBatch`** validates each item against the mutation schema, so a bad item fails alone with `validation_failed`.

## Goals / Non-Goals

**Goals:**
- TS-63's ordinary writes over the app's commands;
- outcomes per item;
- safe retries;
- references for Manage agents;
- AC-37's refusals.

**Non-Goals:**
- the gated operations: deleting to Trash, removing used options, deleting fields, confirming matches (TON-83);
- recovery (TON-84);
- per-grant rates (TON-85).

## Decisions

### 1. A tool is a batch of the app's envelopes

Every tool plans `{name, args, base, after}` items and hands them to `mcpWriter()`, which:
1. claims the key;
2. assigns the IDs;
3. runs `executeBatch` with the API's runner, announcing each item's changes.

So agents get the app's validation, CAS, uniqueness, capacity, capture rules and change log (X-02, X-08), and no write path is MCP's own. A step that needs another runs after it (`after` becomes `dependsOn`): joining a list after creating the album, setting a field after applying it, leaving a list after joining the target.

### 2. Keys of any text, mapped to a batch

Agents can't be relied on to make UUIDv7s, and a made-up one would carry a wrong time.
- **The map.** `mcp_operations(grant_id, key)` maps the key to a fresh v7 `batch_id`, with a hash of the tool and its arguments.
- **Derived IDs.** `derivedId(batch, salt)` keeps the batch's timestamp and fills the rest from SHA-256. The salt is the item's index for mutations, and a name for new records.
- **Determinism.** Plans depend only on the tool's input, so the same key and arguments give the same envelopes and IDs, and a retry replays what ran (TS-25).
- **Concurrency.** Two concurrent calls with one key claim the same batch, and the owner's write lock makes the second wait and replay.
- **Reuse and pruning.** A different request under a used key is refused. Rows are pruned with mutations after 30 days.

### 3. `base` is optional

Agents usually act on what they just read, so a tool without `base` reads the saved value and bases the change on it. With `base`, a stale value is a `conflict` with the current values, which the agent can show the person (TS-21).

### 4. `set_order` with the app's own planner

`planMove` moves to `packages/domain`, and the web app re-exports it.
- **The plan:** the tool reads the view's sequence and keys, then places each item after the one before it, the first at the place given: top, bottom, before or after an item.
- **The write:** every key it writes goes out as one `order.set`, based on the keys before.

### 5. References are the person's collection

`share.saveLink` and `share.removeReference` authorize with the `collection` scope, so:
- a Manage agent may keep or drop references (FR-07.13, FR-10.4);
- a Read-only one gets `permission_denied` (AC-24);
- leaving, accepting and declining invitations stay app-only (X-03).

### 6. What an agent reads of an outcome

Each item is TS-27's outcome, with three changes:
- `confirmed` keeps only a non-null `result`;
- `failed` reads `{code, message, errors?}` from its problem;
- `skipped` names the earlier item it waited for by index (`after`), not by a mutation ID the agent never saw.

Steps without a target of their own, such as an apply before a set, aren't listed. The step that matters reports for them.

## Risks / Trade-offs

- **[A tool's plan reads state before the batch runs]** → Only `base` values and `set_order`'s keys are read. A concurrent change makes them stale, and the command answers `conflict`, as it would for the app.
- **[24 write tools are a lot for an agent to choose from]** → Each maps to one app action, and their descriptions say when to use them. The overview starts agents off.

## Migration Plan

One additive migration: `mcp_operations`.
