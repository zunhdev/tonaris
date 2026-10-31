# Proposal

Linear: TON-138 (Feature). Implements FR-06.2, FR-06.3, FR-11.8. Design: DS-46, DS-94. Done when Settings chooses the streaming services, saved to the account and synced, and the album panel and New album follow it.

## Why

In the creator's manual testing (31 October 2026), the album panel's Links section showed a row for every streaming service in Editing mode, so people saw inputs for services they never use. The creator wanted the services to be choosable in Settings.

## What Changes

- **Settings → Preferences → Streaming services:** a switch per service, all on at first, saved to the account and synced.
- **The album panel in Editing** offers rows only for the services that are on, plus any service the album already links. Saved links always show, with Replace and Remove (the creator chose this, 31 October 2026).
- **New album** shows link fields only for the services that are on, or ones already filled in (the creator chose to include it, 31 October 2026).
- A pasted link of any service is still accepted, by capture and by the panel's existing rows.
- **API:** the account defaults carry `hiddenServices`, set by a new mutation, `defaults.setHiddenServices`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: a person chooses the services whose empty link fields they see.

## Impact

- **`packages/domain`:** `accountDefaultsSchema.hiddenServices`, `setHiddenServices`, `defaults.setHiddenServices`.
- **`packages/db`:** `account_settings.hidden_services`, with a migration.
- **`apps/api`:** the OpenAPI document.
- **`apps/web`:** Preferences, the panel's Links, New album, the defaults' writes, resubmit, dependencies and the conflict review's labels.
- **Docs:** FR-06.3, DS-46, DS-94 and TS-43 as built.
