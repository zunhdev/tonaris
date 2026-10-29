# Tasks

## 1. API

- [x] 1.1 Add `maxExportsPerHour`, share `SlidingWindow`, and add `GET /v1/export` (design decisions 1 to 3). Verify with `export.test.ts`: the four files, the schema-valid JSON, the dated name, no writes, `401`, and the sixth export's `429`.
- [x] 1.2 Regenerate the OpenAPI document, and expose `Content-Disposition` in CORS.
- [x] 1.3 Time the workload's export end to end against a local API, within 3 s.

## 2. Web

- [x] 2.1 Add `features/export/`, with the store, `ExportButton` and `DataExport`, to Settings → Data and the deletion dialog; signing out forgets the export (design decisions 4 and 5). Verify with `export.e2e.ts`: the download's name and files, Download again, the dialog's block, and axe.

## 3. Docs and checks

- [x] 3.1 Record TS-18, TS-80, DS-96 and DS-97 as built.
- [x] 3.2 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
- TON-90 validates a seeded archive in CI.
