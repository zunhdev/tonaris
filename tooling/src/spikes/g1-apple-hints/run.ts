// Runs the TON-16 spike over a links file and its labels.json, which sample.ts writes.
//
//   bun tooling/src/spikes/g1-apple-hints/run.ts tooling/fixtures/g1-apple/links.txt [--cache]
//
// It writes results.json and report.md next to the links file. `--cache` keeps MusicBrainz and iTunes Lookup
// responses in a gitignored cache/ folder there.

import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { Itunes } from "./itunes";
import { type MatchResult, matchLink } from "./match";
import { buildReport } from "./report";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { cache: { type: "boolean", default: false } },
  allowPositionals: true,
});
const [linksFile] = positionals;
if (!linksFile) {
  console.error("Usage: bun tooling/src/spikes/g1-apple-hints/run.ts <links.txt> [--cache]");
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

const cacheDir = values.cache ? path.join(dir, "cache") : undefined;
const mb = new MusicBrainz(cacheDir ? { cacheDir: path.join(cacheDir, "musicbrainz") } : {});
const itunes = new Itunes(cacheDir ? { cacheDir: path.join(cacheDir, "itunes") } : {});
console.error(`Matching ${links.length} Apple Music links…`);

const results: MatchResult[] = [];
for (const [index, { input, sample: name }] of links.entries()) {
  // One link at a time, through the paced MusicBrainz and iTunes clients.
  // oxlint-disable-next-line no-await-in-loop
  const result = await matchLink(index, input, labels, mb, itunes).catch(
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
  results.push(result);
  const outcome = Object.values(result.decisions)[4];
  console.error(
    `[${index + 1}/${links.length}] ${result.error ?? `${result.candidates} candidates, ${outcome?.outcome ?? "?"}`}` +
      (outcome?.correct === undefined ? "" : outcome.correct ? " (right)" : " (WRONG)"),
  );
}

const mbRequests = mb.requests.filter((r) => !r.cached).length;
await Bun.write(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
await Bun.write(path.join(dir, "report.md"), buildReport(results, mbRequests, itunes.requests));
console.error(`Wrote results.json and report.md in ${dir}`);
