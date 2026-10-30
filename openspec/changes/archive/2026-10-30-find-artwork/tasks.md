# Tasks

## 1. Providers

- [x] 1.1 `findCovers`: MusicBrainz's release-group search by title and artist, then title alone, the first 8, each with the archive's front
- [x] 1.2 Unit-test it on stubbed answers: covers kept in order, ones without a front left out, an archive failure for all of them unavailable

## 2. API

- [x] 2.1 `GET /v1/artwork/covers?title=&artist=` for the signed-in person, each cover signed; `503 provider_unavailable` when a source can't be asked
- [x] 2.2 Wire the finder from the providers, and a fixture finder for the browser tests
- [x] 2.3 Route tests and the OpenAPI document

## 3. Web

- [x] 3.1 The Find artwork popover: loading, covers, nothing found, unavailable with Try again; disabled offline
- [x] 3.2 In the inspector's artwork field, saving the chosen cover with an artwork edit
- [x] 3.3 In the manual entry form, filling the Artwork URL from the form's title and artist
- [x] 3.4 Browser tests for both

## 4. Docs

- [x] 4.1 FR-03.4, DS-46 and DS-47 as built, TS-41
- [x] 4.2 Run `bun run check`
