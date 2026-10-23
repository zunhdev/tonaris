# Tasks

## 1. Vocabulary

- [x] 1.1 Add `packages/domain/src/links.ts`: `streamingServices` with `tidal`, `linkKinds`, `serviceNames`, `LinkRef` and `sameLink()`, exported from the domain (design decisions 1 and 4). Verify with `links.test.ts`: the same service, kind and id are the same link; any difference makes them different (spec: equivalent link variants are the same link).
- [x] 1.2 Make `packages/db` use the domain's `streamingServices`, and generate the migration that lets `album_service_links.service` hold `tidal` (design decision 9). Give some of the workload's albums Tidal links (`tooling/src/workload/generate.ts`). Verify with `schema.test.ts`: a Tidal link saves, and an unknown service is refused; and with the workload tests.

## 2. Parser

- [x] 2.1 Add `parseLink()` to `packages/providers/src/links.ts`, with the forms, canonical URLs, input checks and reasons of design decisions 2, 3, 5 and 7. Verify with `links.test.ts`:
  - the fixture table of real variants for all four services, including `intl-`, `si`, URIs, storefronts, `?i=`, `/song/`, Qobuz stores, `/browse`, `listen.`, `www.`, `/u` and `?u` (spec: album and track links of the four services are recognised);
  - every link of the G1 samples parses (spec: real links);
  - each fixture group's variants are the same link (spec: variants of one album; storefronts; an album and a track);
  - playlists, other sites, plain text and incomplete ids fail with `unsupported_link` and their reasons (specs: a playlist; another site; an incomplete link);
  - credentials, ports, look-alike hosts and over-long input fail (spec: credentials in a link).
- [x] 2.2 Add `resolveShortLink()` (design decision 6). Verify with `links.test.ts` and a scripted fetcher:
  - redirects through `spotify.app.link` to an album (spec: a short link);
  - an off-allowlist host, never requested (spec: a short link off the allowlist);
  - Spotify's home page, a non-redirect answer and a fourth hop (spec: a short link that leads nowhere);
  - a thrown fetch, a `5xx` and a `429` (spec: Spotify can't be reached).

## 3. Docs and Linear

- [x] 3.1 Update `docs/tech-spec.md`: TS-40 as built (the result's fields, the `/song/` form decided on 24 October 2026, Apple's and Qobuz's canonical forms, the input checks and the short-link answers), and TS-41's step 2 for `/song/` links. Update DS-48 in `docs/design-spec.md` with the failure reasons as built in TON-39. Verify the text matches the implementation.
- [x] 3.2 Add the `/song/` lookup to TON-42's description in Linear.

## 4. Checks

- [x] 4.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 4.2 Run `openspec validate link-parsing --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive creates `link-capture`, and that `openspec validate --all --strict` passes.
