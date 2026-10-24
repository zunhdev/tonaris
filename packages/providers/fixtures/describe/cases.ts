// The album cases (TON-43): real release groups, from the G2 corpus and TS-46's examples, described against recorded
// MusicBrainz and Cover Art Archive answers (`bun packages/providers/fixtures/describe/record.ts`). Stubs stand in
// for an archive without a front or down, and for a MusicBrainz that stays busy.

import { frontUrl, lookupUrl, type DescribeCase } from "./harness";

export const ids = {
  /** Nirvana's *Bleach*: an Album, first released 8 August 1989. */
  bleach: "f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  /** Keith Jarrett's *The Köln Concert*: a live Album recorded on 24 January 1975. */
  koln: "516d4629-7bf3-3ac3-907a-ed9a022db840",
  /** Bruce Springsteen's *Live/1975–85*: a live compilation, whose first release is a bootleg. */
  springsteen: "85206823-9808-3da2-a9d7-2e9b8b0f4e99",
  /** Nirvana's "Smells Like Teen Spirit (live)": a Single with the secondary type Live. */
  liveSingle: "155ba060-6b49-4f0b-8556-2e13853e061d",
  /** Pop Smoke's *Shoot for the Stars Aim for the Moon*, merged since into `merged`'s new id (G2 spike). */
  merged: "fcd3637b-3365-4780-802d-0013b070bca2",
  mergedInto: "d6d1de65-7e43-4277-b723-fc74a2b385e1",
  /** A release group MusicBrainz deleted (G2 spike). */
  deleted: "60179d2e-07df-4351-90fb-c08c7cde4396",
} as const;

const busy = { status: 503, headers: { "retry-after": "1" } };

export const cases = {
  bleach: { name: "Bleach, a studio album", releaseGroupId: ids.bleach },
  koln: { name: "The Köln Concert, recorded on one night", releaseGroupId: ids.koln },
  springsteen: { name: "Live/1975–85, recorded over years", releaseGroupId: ids.springsteen },
  liveSingle: { name: "a live single", releaseGroupId: ids.liveSingle },
  merged: { name: "a merged release group", releaseGroupId: ids.merged },
  deleted: { name: "a deleted release group", releaseGroupId: ids.deleted },
  noFront: {
    name: "an album the Cover Art Archive has no front for",
    releaseGroupId: ids.bleach,
    stubs: { [frontUrl(ids.bleach)]: { status: 404 } },
  },
  archiveDown: {
    name: "the Cover Art Archive down",
    releaseGroupId: ids.bleach,
    stubs: { [frontUrl(ids.bleach)]: { status: 503 } },
  },
  musicBrainzBusy: {
    name: "MusicBrainz busy throughout",
    releaseGroupId: ids.bleach,
    stubs: { [lookupUrl("release-group", ids.bleach, ["artist-credits", "releases"])]: busy },
  },
} satisfies Record<string, DescribeCase>;
