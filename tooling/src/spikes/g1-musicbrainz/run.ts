// Runs the G1 spike (TON-14) over a file of links, one per line; blank lines and `#` comments are skipped.
//
//   bun tooling/src/spikes/g1-musicbrainz/run.ts <links.txt> [--cache] [--interval 1000]
//
// The sample lives in tooling/fixtures/g1-sample/links.txt. It writes results.json and report.md next to the links file. `--cache` keeps MusicBrainz responses in a
// cache/ folder there, for re-running the report; leave it off for the latency measurement. `--interval` sets
// the milliseconds between request starts.

import path from "node:path";
import { parseArgs } from "node:util";

import { runChain } from "./chain";
import { MusicBrainz } from "./musicbrainz";
import { buildReport } from "./report";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    cache: { type: "boolean", default: false },
    interval: { type: "string", default: "1000" },
  },
  allowPositionals: true,
});
const [linksFile] = positionals;
if (!linksFile) {
  console.error(
    "Usage: bun tooling/src/spikes/g1-musicbrainz/run.ts <links.txt> [--cache] [--interval 1000]",
  );
  process.exit(1);
}

const dir = path.dirname(path.resolve(linksFile));
// `# sample: <name>` starts a group of links; the report shows each group's outcomes apart.
const links: string[] = [];
const samples: (string | undefined)[] = [];
let sample: string | undefined;
for (const raw of (await Bun.file(linksFile).text()).split("\n")) {
  const marker = /^#\s*sample:\s*(\S+)/.exec(raw.trim());
  if (marker) sample = marker[1];
  const line = raw.replace(/\s#.*$/, "").trim();
  if (!line || line.startsWith("#")) continue;
  links.push(line);
  samples.push(sample);
}

const minIntervalMs = Number(values.interval);
const mb = new MusicBrainz({
  minIntervalMs,
  ...(values.cache && { cacheDir: path.join(dir, "cache") }),
});
console.error(
  `Running ${links.length} links, one MusicBrainz request every ${minIntervalMs} ms at most…`,
);
const results = await runChain(links, mb, {
  onResult: (r) => {
    const name = samples[r.index];
    if (name) r.sample = name;
    console.error(
      `[${r.index + 1}/${links.length}] ${r.link ? `${r.link.service} ${r.link.kind}` : "unparsed"}: ` +
        `${r.outcome}${r.step === undefined ? "" : ` (step ${r.step})`}${r.reason ? `, ${r.reason}` : ""}`,
    );
  },
});

await Bun.write(
  path.join(dir, "results.json"),
  JSON.stringify({ results, requests: mb.requests }, null, 2),
);
await Bun.write(path.join(dir, "report.md"), buildReport(results, mb.requests));
console.error(`Wrote results.json and report.md in ${dir}`);
