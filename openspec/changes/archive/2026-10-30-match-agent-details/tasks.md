# Tasks

## 1. Providers

- [x] 1.1 Add `matchDetails` to the identifier: step 4's strict rule on a title, an artist and a year, answering the release group when exactly one album passes
- [x] 1.2 Unit-test it: one, several and none passing

## 2. Domain

- [x] 2.1 Mark an identified capture source whose details were matched, and fill only what they leave unknown from MusicBrainz, with provenance
- [x] 2.2 Unit-test the fill: the agent's values kept, MusicBrainz's added, artwork taken

## 3. API

- [x] 3.1 Add `matchDetails` to `CaptureDeps`, wired from the identifier; the capture fixtures stub it
- [x] 3.2 In `prepareCapture`, match an MCP capture's details after a miss, with an original year; ambiguous links and the app's captures are unchanged
- [x] 3.3 Test through MCP: one match saves as identified with artwork; several save as entered; MusicBrainz unavailable fails; an app capture isn't matched

## 4. Docs

- [x] 4.1 FR-10.5 and TS-41: an agent's details after a miss are matched strictly
- [x] 4.2 Run `bun run check`
