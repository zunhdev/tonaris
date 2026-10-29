# Proposal

Linear: TON-87 (Feature). Implements FR-08.3–FR-08.5. Tech: TS-15, TS-81. Done when the output validates against the schema on the 5,000-album workload, and excluded data is provably absent.

## Why

FR-08 promises an export of the whole owned collection, so people own their data. Every later M10 piece reads one model: the Markdown (TON-88), the ZIP endpoint (TON-89) and the validator (TON-90). That model is `tonaris-export.json` v1 and its JSON Schema.

## What Changes

- **The domain export builder** (`packages/domain/src/export.ts`): a pure function from one owner's saved collection to `tonaris-export.json` v1, with its Zod schema and the JSON Schema (2020-12) made from it.
  - Each album appears once, Trash included and marked, with its links, identifiers, provenance and custom-field values.
  - The tree, with each list's albums, and Trash units with their former memberships.
  - Custom fields with their options' labels; personal views with their manual order; the account defaults.
  - *Unknown*, *unused* and *applied-empty* stay apart.
  - Values a provider's policy withholds become an explicit marker (TS-15).
- **The reader** (`packages/db/src/export.ts`): one read-only REPEATABLE READ transaction over the owner's collection tables only. No account, sharing, reference or credential table is read.

## Capabilities

### New Capabilities

- `data-export`: the export's contents and exclusions.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:** `export.ts`, exported from the index.
- **`packages/db`:** `export.ts`; `sync.ts` shares its column maps and value reader.
- **Docs:** TS-81 as built.
- **No API change.** The endpoint is TON-89's.
