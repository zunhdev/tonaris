// Runs the TON-15 spike over a links file and its labels.json, which sample.ts writes. Needs SPOTIFY_CLIENT_ID and
// SPOTIFY_CLIENT_SECRET in the repository root's .env: a development-mode app owned by a Premium account.
//
//   bun tooling/src/spikes/g1-spotify/run.ts tooling/fixtures/g1-spotify/links.txt [--burst 100] [--rerun-errors]
//
// It writes results.json and report.md next to the links file. There is no cache: Spotify responses may not be
// kept (TS-41), and MusicBrainz requests carrying a UPC would keep it in their cache keys. `--burst` then sends
// that many Get Album calls back to back over the sample's albums, to see how development mode meets a batch.
// `--rerun-errors` runs again only the links results.json records as errors, such as MusicBrainz's 503s, and
// keeps the rest of the previous run.

import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { parseLink } from "../g1-musicbrainz/links";
import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { type BridgeResult, bridgeLink } from "./bridge";
import { buildReport } from "./report";
import { type SpotifyRequest, spotifyFromEnv } from "./spotify";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { burst: { type: "string" }, "rerun-errors": { type: "boolean", default: false } },
  allowPositionals: true,
});
const [linksFile] = positionals;
if (!linksFile) {
  console.error(
    "Usage: bun tooling/src/spikes/g1-spotify/run.ts <links.txt> [--burst 100] [--rerun-errors]",
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
type Run = { results: BridgeResult[]; spotify: SpotifyRequest[]; burst?: SpotifyRequest[] };
const previous: Run | undefined = values["rerun-errors"]
  ? await Bun.file(path.join(dir, "results.json")).json()
  : undefined;
const results: BridgeResult[] = previous?.results ?? [];
const todo = previous
  ? results.flatMap((r) => (r.error ? [r.index] : []))
  : links.map((_, index) => index);

// MusicBrainz answers 503 under load as well as to fast clients, so this run gives it slack and more retries.
const mb = new MusicBrainz({ minIntervalMs: 1_100, maxRetries: 8 });
const spotify = spotifyFromEnv();
console.error(`Bridging ${todo.length} Spotify links…`);

for (const index of todo) {
  const { input, sample: name } = links[index] ?? { input: "" };
  // One link at a time, through the paced MusicBrainz and Spotify clients, as capture jobs would.
  // oxlint-disable-next-line no-await-in-loop
  const result = await bridgeLink(index, input, labels, mb, spotify);
  if (name) result.sample = name;
  results[index] = result;
  console.error(
    `[${index + 1}/${links.length}] ${result.kind ?? "?"}: ${
      result.error ??
      `step 2 ${result.step2?.outcome ?? "—"}, UPC ${result.upc ?? "—"}, step 3 ${result.step3?.outcome ?? "—"}`
    }${result.step3Correct === undefined ? "" : result.step3Correct ? " (right)" : " (WRONG)"}`,
  );
}

let burst = previous?.burst;
if (values.burst) {
  const albums = links.flatMap(({ input }) => {
    const parsed = parseLink(input);
    return parsed.ok && parsed.link.albumId ? [parsed.link.albumId] : [];
  });
  const burster = spotifyFromEnv({ minIntervalMs: 0 });
  const count = Number(values.burst);
  console.error(`Burst: ${count} Get Album calls back to back…`);
  for (let i = 0; i < count; i++) {
    // Back to back on purpose: the point is to see whether development mode throttles a batch.
    // oxlint-disable-next-line no-await-in-loop
    await burster.album(albums[i % albums.length] ?? "").catch(() => undefined);
  }
  burst = burster.requests.filter((r) => r.call !== "token");
}

const run: Run = {
  results,
  spotify: [...(previous?.spotify ?? []), ...spotify.requests],
  ...(burst && { burst }),
};
await Bun.write(path.join(dir, "results.json"), `${JSON.stringify(run, null, 2)}\n`);
await Bun.write(path.join(dir, "report.md"), buildReport(run.results, run.spotify, run.burst));
console.error(`Wrote results.json and report.md in ${dir}`);
