// Runs the TON-99 spike over a links file and its labels.json, which sample.ts writes: Qobuz's store pages, or
// with `--service tidal` Tidal's (the G1 Tidal spike).
//
//   bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-qobuz/links.txt [--rerun-errors] [--explain]
//   bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-tidal/links.txt --service tidal --out <dir>
//
// It writes results.json and report.md next to the links file, or in `--out`. There is no cache: nothing from the
// store may be kept (TON-17), and MusicBrainz searches carrying the page's title and artist would keep them in
// their cache keys. results.json is written after each link. `--rerun-errors` runs again only the links
// results.json records as errors, such as a timeout, or doesn't have yet, after an interrupted run, and keeps the
// rest. `--explain` prints each link's hints to the terminal, never to a file, for reading failures.

import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { Tidal } from "../g1-tidal/tidal";
import { type MatchResult, matchLink } from "./match";
import { type PageRequest, Qobuz, type StoreHints, type StorePages } from "./qobuz";
import { buildReport, type RequestKinds } from "./report";
import { recommended } from "./rules";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    service: { type: "string", default: "qobuz" },
    out: { type: "string" },
    "rerun-errors": { type: "boolean", default: false },
    explain: { type: "boolean", default: false },
  },
  allowPositionals: true,
});
const [linksFile] = positionals;
if (!linksFile || (values.service !== "qobuz" && values.service !== "tidal")) {
  console.error(
    "Usage: bun tooling/src/spikes/g1-qobuz-hints/run.ts <links.txt> [--service qobuz|tidal] [--out <dir>] [--rerun-errors] [--explain]",
  );
  process.exit(1);
}

const stores: Record<
  "qobuz" | "tidal",
  () => { pages: StorePages; host: string; kinds?: RequestKinds }
> = {
  qobuz: () => ({ pages: new Qobuz(), host: "www.qobuz.com" }),
  tidal: () => ({
    pages: new Tidal(),
    host: "tidal.com",
    kinds: [
      ["page", "The album page, `/album/{id}`"],
      ["robots", "robots.txt, once per run"],
    ],
  }),
};
const store = stores[values.service]();
const { pages } = store;

const dir = path.dirname(path.resolve(linksFile));
const out = values.out ? path.resolve(values.out) : dir;
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
type Run = { results: MatchResult[]; store: PageRequest[]; mbRequests: number };
const previous: Run | undefined = values["rerun-errors"]
  ? await Bun.file(path.join(out, "results.json")).json()
  : undefined;
const results: MatchResult[] = previous?.results ?? [];
const todo = links.flatMap((_, index) => {
  const done = previous?.results[index];
  return !previous || !done || done.error ? [index] : [];
});

if (!(await pages.albumPagesAllowed())) {
  console.error(`${store.host}'s robots.txt disallows album pages, so the requests stop (TS-41).`);
  process.exit(1);
}
// MusicBrainz answers 503 under load as well as to fast clients, so this run gives it slack and more retries.
const mb = new MusicBrainz({ minIntervalMs: 1_100, maxRetries: 8 });
console.error(`Matching ${todo.length} ${pages.service} links…`);

const explain = values.explain
  ? (hints: StoreHints | undefined, r: MatchResult) => {
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
    store: [...(previous?.store ?? []), ...pages.requests],
    mbRequests: (previous?.mbRequests ?? 0) + mb.requests.length,
  };
  await Bun.write(path.join(out, "results.json"), `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

for (const index of todo) {
  const { input, sample: name } = links[index] ?? { input: "" };
  // One link at a time, through the paced MusicBrainz and store clients, as capture jobs would.
  // oxlint-disable-next-line no-await-in-loop
  const result = await matchLink(index, input, labels, mb, pages, explain).catch(
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
await Bun.write(
  path.join(out, "report.md"),
  buildReport(run.results, run.store, run.mbRequests, {
    host: store.host,
    ...(store.kinds && { kinds: store.kinds }),
  }),
);
console.error(`Wrote results.json and report.md in ${out}`);
