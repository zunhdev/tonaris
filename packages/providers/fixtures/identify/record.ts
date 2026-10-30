// Records MusicBrainz's and iTunes Lookup's answers for the identification cases into recorded.json, from the
// network, at their real pace (about a minute and a half). Re-run it when a case changes or MusicBrainz's answers
// should be refreshed:
//   bun packages/providers/fixtures/identify/record.ts
// Name cases to record only those, keeping every other recorded answer:
//   bun packages/providers/fixtures/identify/record.ts killEmAll andJustice

import path from "node:path";

import { z } from "zod";

import { safeFetch } from "../../src/safe-fetch";
import { cases, detailsCases } from "./cases";
import { detailsHarness, harness, type Recording } from "./harness";

const file = path.join(import.meta.dir, "recorded.json");
const only = new Set(process.argv.slice(2));
const recordingSchema = z.record(z.string(), z.object({ status: z.number(), body: z.unknown() }));
const recording: Recording =
  only.size > 0 ? recordingSchema.parse(await Bun.file(file).json()) : {};
const chosen = (key: string) => only.size === 0 || only.has(key);

/** Writes what is recorded so far, sorted, so an interrupted run keeps its cases. */
async function save(): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(recording).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  await Bun.write(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

for (const [key, testCase] of Object.entries(cases)) {
  if (!chosen(key)) continue;
  const started = performance.now();
  const run = harness(testCase, { record: recording, fetch: safeFetch });
  // Cases run one after another, as the providers' pace would anyway.
  // oxlint-disable-next-line no-await-in-loop
  const answer = await run.identify();
  // oxlint-disable-next-line no-await-in-loop
  await save();
  const summary =
    answer.status === "failed"
      ? answer.failure.code
      : answer.status === "identified"
        ? `step ${answer.step}: ${answer.releaseGroupId}`
        : answer.status === "ambiguous"
          ? `step ${answer.step}: ${answer.candidates.map((candidate) => candidate.releaseGroupId).join(", ")}`
          : answer.status;
  console.log(
    `${key}: ${answer.status} (${summary}), ${run.requests.length} requests, ${Math.round(performance.now() - started)} ms`,
  );
  // A new client per case has a queue of its own, so cases are a second apart for MusicBrainz's sake.
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(1_000);
}
for (const [key, { details }] of Object.entries(detailsCases)) {
  if (!chosen(key)) continue;
  const run = detailsHarness({ record: recording, fetch: safeFetch });
  // oxlint-disable-next-line no-await-in-loop
  const matched = await run.matchDetails(details);
  // oxlint-disable-next-line no-await-in-loop
  await save();
  console.log(`${key}: ${matched ?? "no single album"}, ${run.requests.length} requests`);
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(1_000);
}
console.log(`Recorded ${Object.keys(recording).length} answers.`);
