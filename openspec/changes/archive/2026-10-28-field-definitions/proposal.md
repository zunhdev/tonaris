# Proposal

Linear: TON-49 (Feature). Implements:
- FR-03.6, account-level field definitions: six types, choice fields with their options, no predefined fields;
- FR-03.9 and X-06, case-insensitive name uniqueness across types;
- FR-03.11 and X-09, renames that change the one definition everywhere, albums in Trash included, keeping its type, options, usage and values.

Tech: TS-11 (`field_definitions`, `field_options`), TS-18 (50 fields, 100 options, 200-character names). Done when tests cover the definition commands, including name collisions and renames that reach albums in Trash.

## Why

Custom fields are M4's subject, and every later issue builds on definitions: per-album values (TON-50), type changes and options (TON-51), deletion (TON-52) and the Settings screen (TON-53). The tables exist since TON-5, but nothing writes them, and clients don't hold fields.

## What Changes

- **`field.create {id, name, type, options}`** defines a field: text, number, date, yes/no, single choice or multiple choice. A choice field may start with options, each `{id, label}`. A field of any other type takes none.
- **`field.rename {id, name}`,** with `base.name`, renames it everywhere; a case-only rename keeps the new spelling.
- **The rules,** checked under the owner's write lock:
  - names and option labels can't be blank, and have at most 200 characters;
  - names are unique per account across types, and labels unique within their field, case-insensitively (X-06);
  - at most 50 fields per account and 100 options per field (TS-18);
  - a create sent again duplicates nothing (FR-13.5).
- **Fields reach clients:** a `field` record, `{id, name, type, options}` with its options in their order, in the bootstrap and on the stream.
- **The web client** gets a fields collection whose writes are these mutations, with their descriptions, retries and dependencies. The screens come with TON-50 and TON-53.

## Capabilities

### New Capabilities

- `custom-fields`: account-level custom-field definitions and, as M4 goes on, their per-album values, options, type changes and deletion.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:**
  - `fields.ts`: the vocabulary, the record, and the commands;
  - `field.create` and `field.rename` in `mutationSchema`;
  - the `field` change, and the bootstrap's `fields`;
  - the store's field methods, in `memoryStore` too;
  - `maxFields` and `maxFieldOptions`.
- **`packages/db`:**
  - the store's field methods;
  - fields in the bootstrap;
  - `fieldTypes` from the domain.
- **`apps/api`:** the regenerated OpenAPI document; every change is additive.
- **`apps/web`:** the fields collection, `describeWrite()`, `resubmit()` and `dependenciesOf()`.
- **No schema change:** the tables exist since TON-5.
