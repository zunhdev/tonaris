# Proposal

Linear: TON-81 (Feature). Implements FR-10.2 and FR-10.9 for reading, FR-12 through MCP, and Q-05. Tech: TS-15, TS-63, TS-65. Done when the contract tests pass and a Read-only connection sees no write tools.

## Why

G3 left four early tools: `get_overview` with counts only, a single-page `list_container`, an albums-only `search`, and `get_approval`. An agent can't yet do these:
- read one album in full;
- page through a long list, Unsorted or Trash;
- see the custom fields;
- see what's shared with the person;
- check a change whose answer was lost.

TS-63's read group completes the picture. The write tools (TON-82) build on it: they need IDs, option IDs and orders to act on.

## What Changes

Every read tool is offered in both modes, read-only by annotation.
- **`get_overview`:**
  - the counts;
  - usage against each limit, Trash included: albums, folders and lists, list entries, fields;
  - the folder and list tree, breadth-first up to 500;
  - the connection's mode.
- **`list_container`:**
  - the top level, a folder or a list, 200 per page with an opaque cursor;
  - in the person's manual order, then folders and lists as created and albums as added (TS-16);
  - also a folder or list shared with the person, with who shares it.
- **`get_album`:**
  - every value, the streaming links, custom-field values with chosen options, the lists with their paths, and whether it is in Trash;
  - the person's own albums, or one shared with them.
- **`search`:** the app's search, with folders, lists and albums, then what's shared, each group with its total (FR-12, X-02).
- **`list_unsorted`** and **`list_trash`**, paginated. **`list_fields`**, with options and usage. **`list_shared_with_me`**.
- **`get_operation {idempotencyKey}`:**
  - the stored outcome of a change this account made, or `pending` while one runs;
  - a key never received is `not_found`, which means it is safe to make the change.
- **Policy (TS-15):** album values pass `filterFields(…, "agent")`, so a withheld value comes as `{"withheld": "provider-policy"}`. No current source withholds anything.
- **Field names** are the API's (`artistCredit`, `originalYear`), as the write tools will take them. The G3 tools' `artist` and `year` go.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-access`: what agents read, and how results are shaped.

## Impact

- **`packages/db`:** a new `mcp-reads.ts` for usage, the tree, container and Unsorted pages, album detail, Trash and fields with usage. `fieldsOfAccount` and `unitsOfAccount` are exported from `sync.ts`.
- **`apps/api`:**
  - `mcp/read-tools.ts` holds the read tools, and `mcp/results.ts` the result, failure, policy and cursor helpers;
  - `server.ts` keeps G3's two write tools until TON-82 and TON-83 replace them.
- **No schema change. No `/v1` change.**
- **Docs:** TS-63 and TS-65 as built.
