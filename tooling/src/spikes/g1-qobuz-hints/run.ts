// Runs the TON-99 spike over a links file and its labels.json, which sample.ts writes.
//
//   bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-qobuz/links.txt [--rerun-errors] [--explain]
//
// It writes results.json and report.md next to the links file. There is no cache: nothing from Qobuz may be kept
// (TON-17), and MusicBrainz searches carrying the page's title and artist would keep them in their cache keys.
// results.json is written after each link. `--rerun-errors` runs again only the links results.json records as
// errors, such as a timeout, or doesn't have yet, after an interrupted run, and keeps the rest. `--explain` prints each link's hints to the terminal, never to a file, for
// reading failures.

import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { type MatchResult, matchLink } from "./match";
import { Qobuz, type QobuzHints, type QobuzRequest } from "./qobuz";
import { buildReport } from "./report";
import { recommended } from "./rules";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "rerun-errors": { type: "boolean", default: false },
    explain: { type: "boolean", default: false },
  },
  allowPositionals: true,
});
const [linksFile] = positionals;
if (!linksFile) {
  console.error(
    "Usage: bun tooling/src/spikes/g1-qobuz-hints/run.ts <links.txt> [--rerun-errors] [--explain]",
  );
  process.exit(1);
}

const dir = path.dirname(path.resolve(linksFile));
const labels = z
  .record(z.string(), z.object({ releaseGroupIds: z.array(z.string()), source: z.string() }))
  .parse(await Bun.file(path.join(dir, "labels.json")).json());

const links: { input: string; sample?: string }[] = [];
let sample: string | undefined;
for (const raw of (await Bun.file(linksFile).text()).split("\n")) {
  const marker = /^#\s*sample:\s*(\S+)/.exec(raw.trim());
  if (marker) sample = marker[1];
  const input = raw.replace(/\s#.*$/, "").trim();
  if (input && !input.startsWith("#")) links.push({ input, ...(sample && { sample }) });
}

// The previous run, whose results a rerun of its errors keeps. Its shape is this script's own output.
type Run = { results: MatchResult[]; qobuz: QobuzRequest[]; mbRequests: number };
const previous: Run | undefined = values["rerun-errors"]
  ? await Bun.file(path.join(dir, "results.json")).json()
  : undefined;
const results: MatchResult[] = previous?.results ?? [];
const todo = links.flatMap((_, index) => {
  const done = previous?.results[index];
  return !previous || !done || done.error ? [index] : [];
});

const qobuz = new Qobuz();
if (!(await qobuz.albumPagesAllowed())) {
  console.error("www.qobuz.com's robots.txt disallows album pages, so the requests stop (TS-41).");
  process.exit(1);
}
// MusicBrainz answers 503 under load as well as to fast clients, so this run gives it slack and more retries.
const mb = new MusicBrainz({ minIntervalMs: 1_100, maxRetries: 8 });
console.error(`Matching ${todo.length} Qobuz links…`);

const explain = values.explain
  ? (hints: QobuzHints | undefined, r: MatchResult) => {
      const truth = r.truth?.releaseGroupIds[0];
      const d = r.decisions[recommended];
      console.error(
        `    ${hints ? JSON.stringify(hints) : r.page?.problem}\n    truth ${
          (truth && r.albumTitles[truth]) ?? truth ?? "—"
        }; ${d?.outcome ?? "—"} ${d?.releaseGroupId ? r.albumTitles[d.releaseGroupId] : ""}`,
      );
    }
  : undefined;

/** Writes the run so far, so an interrupted run can go on with `--rerun-errors`. */
async function save() {
  const run: Run = {
    results,
    qobuz: [...(previous?.qobuz ?? []), ...qobuz.requests],
    mbRequests: (previous?.mbRequests ?? 0) + mb.requests.length,
  };
  await Bun.write(path.join(dir, "results.json"), `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

for (const index of todo) {
  const { input, sample: name } = links[index] ?? { input: "" };
  // One link at a time, through the paced MusicBrainz and Qobuz clients, as capture jobs would.
  // oxlint-disable-next-line no-await-in-loop
  const result = await matchLink(index, input, labels, mb, qobuz, explain).catch(
    (error: unknown): MatchResult => ({
      index,
      input,
      knownByUrl: false,
      candidates: 0,
      albumTitles: {},
      decisions: {},
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  if (name) result.sample = name;
  results[index] = result;
  const d = result.decisions[recommended];
  console.error(
    `[${index + 1}/${links.length}] ${
      result.error ??
      result.page?.problem ??
      `${result.candidates} candidates, ${d?.outcome ?? "?"}`
    }${d?.correct === undefined ? "" : d.correct ? " (right)" : " (WRONG)"}`,
  );
  // oxlint-disable-next-line no-await-in-loop
  await save();
}

const run = await save();
await Bun.write(path.join(dir, "report.md"), buildReport(run.results, run.qobuz, run.mbRequests));
console.error(`Wrote results.json and report.md in ${dir}`);
