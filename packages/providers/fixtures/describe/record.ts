// Records MusicBrainz's and the Cover Art Archive's answers for the album cases into recorded.json, from the
// network, at MusicBrainz's pace (about 15 seconds). Re-run it when a case changes or the answers should be
// refreshed:
//   bun packages/providers/fixtures/describe/record.ts

import path from "node:path";

import { ProviderUnavailableError } from "../../src/errors";
import { safeFetch } from "../../src/safe-fetch";
import { cases } from "./cases";
import { harness, type Recording } from "./harness";

const file = path.join(import.meta.dir, "recorded.json");
const recording: Recording = {};

/** Writes what is recorded so far, sorted, so an interrupted run keeps its cases. */
async function save(): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(recording).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  await Bun.write(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

for (const [key, testCase] of Object.entries(cases)) {
  // A busy MusicBrainz is a stub throughout; recording it would only wait out the retries.
  if (key === "musicBrainzBusy") continue;
  const started = performance.now();
  const run = harness(testCase, { record: recording, fetch: safeFetch });
  let summary: string;
  try {
    // Cases run one after another, as MusicBrainz's pace would anyway.
    // oxlint-disable-next-line no-await-in-loop
    const facts = await run.describe();
    summary =
      facts.status === "deleted"
        ? "deleted"
        : `${facts.releaseGroupId}: ${Object.keys(facts.values).join(", ")}`;
  } catch (error) {
    if (!(error instanceof ProviderUnavailableError)) throw error;
    summary = `unavailable: ${error.message}`;
  }
  // oxlint-disable-next-line no-await-in-loop
  await save();
  console.log(
    `${key}: ${summary}, ${run.requests.length} requests, ${Math.round(performance.now() - started)} ms`,
  );
  // A new client per case has a queue of its own, so cases are a second apart for MusicBrainz's sake.
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(1_000);
}
console.log(`Recorded ${Object.keys(recording).length} answers.`);
