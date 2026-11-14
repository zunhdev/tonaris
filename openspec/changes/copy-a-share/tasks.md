## 1. The copy

- [x] 1.1 FR-07.22 and AC-51 in the PRD.
- [x] 1.2 `planShareCopy` and `share.copy` in the domain, with the store's `copyAlbums` and `albumIdentities`, and tests.
- [x] 1.3 The database store's reads, the preview (`GET /v1/shared/{id}/copy`), and an API test against Postgres.

## 2. MCP

- [x] 2.1 `copy_share` approvals, with a migration for the operation's check, and its words.
- [x] 2.2 `copy_shared`, tested through approval and as an editor's agent.

## 3. The app

- [x] 3.1 "Copy to my collection…" and its dialog in viewed and edited shares; the outbox's switches know `share.copy`.
- [x] 3.2 A browser test: the preview, Copy, the toast's Open, and the share kept.

## 4. Words

- [x] 4.1 DS-70, TS-63's tools and approvals, and the sync protocol record it.
