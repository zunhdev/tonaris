# Proposal

Linear: TON-161 (Design). Changes FR-02.4's manual entry form (DS-47). Done when the "New album" form's release type starts at Album wherever it opens empty, and Unknown stays a choice.

## Why

In the creator's manual testing (4 November 2026): the form's release type started at Unknown, so nearly every album entered by hand needed a switch to Album first, time spent on every album.

## What Changes

- **The form's release type starts at Album,** from "Enter manually", after a failed capture, and when capture asks for details without finding a type (today's prefills never carry one: Apple's title, artist and year only). A type capture found is kept.
- **Edit on a failed save** reopens the album as entered, its type included.
- **Unknown stays a choice,** and saves no type, as before.
- **The default isn't entered data:** Esc closes an untouched form without asking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: a new album's release type starts at Album.

## Impact

- **`apps/web`:** `album-form.ts` (`emptyForm`), `capture/manual-entry.ts` (the prefill); unit tests, and a check in `album-inspector.e2e.ts`.
- **Docs:** DS-47 as built.
