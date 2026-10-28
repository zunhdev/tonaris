# Proposal

Linear: TON-52 (Feature). Implements:
- FR-03.18, deleting a field permanently, always confirmed (X-07);
- X-09, deletion reaching albums in Trash, and recovery never bringing a field back.

Tech: TS-14. Done when AC-12's deletion checks pass and restoring from Trash never brings a deleted field back. Builds on TON-51's confirmed option removal. The Settings screen and its dialog are TON-53 (DS-60).

## Why

A field can be defined, applied, changed and its options removed, but not deleted. AC-12 asks that deleting a field is confirmed across active and trashed albums, and that recovery never recreates it.

## What Changes

- **`field.delete {id, scopeHash}`** deletes a field with its options and every album's usage and value, Trash included, in one transaction.
  - It is always confirmed, even for an unused field.
  - The hash covers the field's scope: its definition, options and the albums applying it, active and in Trash. The server recomputes it under the owner's lock.
  - A stale hash is refused with `field_in_use`, and nothing changes.
- **A read of the deletion scope:** `GET /v1/fields/{fieldId}/deletion` gives:
  - the field, with its type and options;
  - the albums applying it, active and in Trash;
  - the hash that confirms exactly that.
- **The web client** deletes from the fields collection, with the confirmed hash in the delete's metadata.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: gains permanent deletion.

## Impact

- **`packages/domain`:**
  - the command and the deletion scope;
  - the mutation;
  - the store's methods.
- **`packages/db`:** the store's methods and the deletion read; the foreign keys already cascade.
- **`apps/api`:** the deletion route and the regenerated OpenAPI document; only additions.
- **`apps/web`:** the fields collection's deletes, with descriptions, retries and dependencies.
- **No schema change.**
