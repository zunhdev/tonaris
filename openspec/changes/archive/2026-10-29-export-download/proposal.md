# Proposal

Linear: TON-89 (Feature). Implements FR-08.1, FR-08.6 and FR-08.7. Design: DS-96, DS-97. Tech: TS-18, TS-80. Done when AC-41 passes and exporting 5,000 albums takes 3 s or less.

## Why

TON-87 and TON-88 build the export's files. A person still can't get them: nothing serves the archive, and Settings → Data and the account-deletion dialog don't offer it.

## What Changes

- **`GET /v1/export`**: reads one read-only snapshot, builds the export with the provider policy, and streams a ZIP of the four files, named `tonaris-export-YYYYMMDD-HHmm.zip`. Session only. Five per account per hour; the sixth answers `rate_limited` with `Retry-After`. A failed build counts nothing.
- **Settings → Data**: "Download your data", with what's included and what isn't, and the button's states: preparing, ready with **Download again**, and failed with the reason and **Retry**.
- **The account-deletion dialog**: a "Download your data first" block with the same button.
- **CORS** exposes `Content-Disposition`, so the web app names the file as the server does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-export`: downloading the archive, its limit, and where the app offers it.

## Impact

- **`apps/api`:** `routes/v1/export.ts`, the `fflate` dependency (0.8.2), the shared `SlidingWindow`, CORS, and the OpenAPI document (`exportData`).
- **`packages/domain`:** `maxExportsPerHour`.
- **`apps/web`:** `features/export/`, Settings → Data, the deletion dialog, and signing out forgetting the export.
- **Docs:** TS-18, TS-80, DS-96 and DS-97 as built.
