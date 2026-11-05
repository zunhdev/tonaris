# Tasks

## 1. The rule

- [x] 1.1 `passes()` counts official singles when the hints carry a track count, keeping the track-count check; verified by `hints.test.ts`: a single with the playlist's count passes, an album playlist's namesake single with another count fails, and hints without a count still reject singles
- [x] 1.2 An identification case for the YouTube Music link of *Opiate²*, its stubs carrying MusicBrainz's facts for the single and its MusicBrainz answers recorded; verified by `identify.test.ts`: identified at step 4 as the single, and *Natural*'s namesake EP case unchanged

## 2. Docs and checks

- [x] 2.1 TS-41's step 4 row and the YouTube Music section in `docs/tech-spec.md`, and the comments in `hints.ts`, say singles count with a track count (TON-163)
- [x] 2.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then run `bun run check:specs`.
