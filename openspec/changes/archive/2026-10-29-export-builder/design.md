# Design

## Context

- The sync bootstrap (TS-24) already reads the owner's active collection in one REPEATABLE READ transaction. The export needs Trash too, and the provenance and identifiers the bootstrap leaves out.
- TS-81 gives the JSON's shape; TS-15 says the builder applies the provider policy, which withholds nothing today.

## Goals / Non-Goals

**Goals:** one model, built purely and deterministically, that later issues render, zip and validate.

**Non-Goals:**
- the endpoint, its limits, and the ZIP (TON-89);
- the Markdown and README (TON-88);
- import or restore (FR-08.1).

## Decisions

### 1. A pure builder over a source the reader fills

`buildExport(source, exportable)` takes plain rows. The reader is the only code that touches the database, and its source type has no place for account, sharing or credential data, so excluded data is left out by construction (FR-08.4). The builder is unit-tested without a database.

### 2. The app's own names, not TS-81's sketch

Albums keep `recordingYearStart` and `recordingYearEnd`, and the defaults keep `listSortMode` and the rest, as the API and MCP name them. A reader moving between the export and the API meets one vocabulary. TS-81 records the shape as built.

### 3. Values by type

A field's value is:
- a string for text;
- a decimal string for a number, so nothing is rounded;
- a `YYYY-MM-DD` string for a date;
- a boolean for yes/no;
- `{ optionId, label }` for a single choice, and a list of them for a multiple choice.

Applied-empty is `null`; an unused field is absent from `album.fields`; unknown metadata is `null`. The conventions block says so in the file itself.

### 4. Trash as it is kept

- **Albums and containers** carry `status` and `trashUnitId`.
- **Each list's `albumIds`** are its saved memberships, Trash included.
- **Each unit** lists its containers and albums, and the memberships that recovery would bring back (`formerMemberships`).

### 5. The policy as a predicate

The domain can't import `@tonaris/providers`. So the builder takes `exportable(source)`, and the caller passes the provider policy. A withheld value becomes `{ "withheld": "provider-policy" }`. The marker's literal moves to the domain, and providers re-exports it, so the MCP and the export share one literal.

### 6. The schema from Zod

The JSON Schema is `z.toJSONSchema` of the export's Zod schema, so the two can't drift. Tests parse every built export with the Zod schema.

## Risks / Trade-offs

- **Size:** 5,000 albums make a JSON of a few MB, built in memory. TS-80 allows that; a larger collection would move to a job.
