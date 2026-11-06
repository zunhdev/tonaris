# Tasks

## 1. Remove the unused enrichment

- [x] 1.1 Remove `createEnricher` and `providers.enrich` from the API, and the `hub` parameter of `createProviders` that only they used; verified by the API's type check and `providers.test.ts`
- [x] 1.2 Remove `enrichAlbum` and `albumReleaseGroup` from `packages/db`, with their tests and exports; verified by the workspace type check

## 2. Tests for the scenarios

- [x] 2.1 A reused album fills only its gaps: a person's value, a conflicting classification and an existing artwork URL are kept, and a repeat writes and publishes nothing; verified by a test in `packages/domain/src/capture.test.ts`
- [x] 2.2 The Cover Art Archive down and MusicBrainz busy keep their existing tests in `packages/providers/src/album-facts.test.ts` and `apps/api/src/capture.test.ts`

## 3. Docs and checks

- [x] 3.1 TS-42, TS-44 and the resolver chain's notes, the AC-10 evidence, and the comments in `errors.ts` and `album-facts.ts` say enrichment happens in a capture and the person retries it
- [x] 3.2 `bun run format` twice, then `bun run check` passes
