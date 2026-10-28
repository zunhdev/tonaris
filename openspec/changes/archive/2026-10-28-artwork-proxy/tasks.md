# Tasks

## 1. Domain

- [x] 1.1 Add `artworkUrl` to the album fields with `isArtworkUrl()`, `artworkPath()`, and `syncedAlbumSchema`; make enrichment's fields the album's, and capture keep the CAA artwork in its values (design decisions 1 and 2). Verify with the domain tests, updated for the field.

## 2. Database

- [x] 2.1 Send `artwork_url` in client records, and log enriched artwork as a change. Verify with `enrichment.test.ts`: filling only the artwork logs a change (spec: enriched artwork reaches the app).

## 3. API

- [x] 3.1 Add the signer, the presentation of the bootstrap and the stream, and the `/img` route (design decisions 2 and 3); regenerate the OpenAPI document. Verify with `artwork.test.ts`:
  - signatures (spec: an unsigned URL);
  - the bootstrap's signed albums;
  - an http artwork URL refused (spec: not an https link);
  - a signed PNG served and cached;
  - forged and malformed paths fetching nothing;
  - SVG, missing and refused hosts as 404s (spec: not a raster image).

## 4. Web

- [x] 4.1 Show artwork from the proxy in rows, cards and the inspector, and add the artwork URL to manual entry and the inspector (design decision 4). Verify with `album-form.test.ts`, and Playwright (`artwork.e2e.ts`):
  - an image from the API host, the artwork's host never contacted (spec: a signed image);
  - a failed one keeping the tile (spec: a failed image);
  - the inspector refusing an http link and saving an https one (specs: entering artwork; not an https link).

## 5. Docs

- [x] 5.1 Update as built: TS-103, TS-11's client records, DS-23, DS-46, DS-47, and `docs/api/sync-protocol.md`. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate artwork-proxy --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `album-records`, and that `openspec validate --all --strict` passes.
