// The TON-15 tables: how far each sample gets through steps 2 and 3, the bridge's hit rate and precision, why it
// misses, what track links land on, and what it costs in Spotify calls and MusicBrainz requests.

import { percentile } from "../g1-musicbrainz/report";
import type { BridgeResult } from "./bridge";
import type { SpotifyRequest } from "./spotify";

const percent = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} (${Math.round((part / whole) * 100)}%)`;

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

const found = (r: BridgeResult, step: "step2" | "step3") => r[step]?.outcome === "confident";

function samples(results: readonly BridgeResult[]): string {
  const groups = Map.groupBy(results, (r) => r.sample ?? "links");
  return table(
    [
      "Sample",
      "Links",
      "Labelled",
      "Spotify has it",
      "UPC",
      "Step 2: one album",
      "Step 3: one album",
      "Step 3 adds",
      "Steps 2–3: one album",
      "Several albums",
    ],
    [...groups].map(([name, group]) => {
      const reached = group.filter((r) => r.upc === "present" || r.upc === "missing");
      return [
        name,
        String(group.length),
        String(
          group.filter((r) => r.truth && r.truth.source !== "MusicBrainz URL relationship").length,
        ),
        String(reached.length),
        percent(group.filter((r) => r.upc === "present").length, reached.length),
        percent(group.filter((r) => found(r, "step2")).length, group.length),
        percent(group.filter((r) => found(r, "step3")).length, group.length),
        String(group.filter((r) => found(r, "step3") && r.step2?.outcome === "none").length),
        percent(group.filter((r) => r.chain?.outcome === "confident").length, group.length),
        String(group.filter((r) => r.chain?.outcome === "needs_input").length),
      ];
    }),
  );
}

function precisionRow(name: string, group: readonly BridgeResult[]) {
  const step3 = group.filter((r) => r.step3Correct !== undefined);
  const chain = group.filter((r) => r.chain?.correct !== undefined);
  const step2Misses = group.filter((r) => r.step2?.outcome === "none");
  return [
    name,
    String(group.length),
    String(step3.filter((r) => r.step3Correct).length),
    String(step3.filter((r) => !r.step3Correct).length),
    percent(step3.filter((r) => r.step3Correct).length, step3.length),
    percent(group.filter((r) => r.step3Correct).length, group.length),
    percent(step2Misses.filter((r) => r.step3Correct).length, step2Misses.length),
    percent(chain.filter((r) => r.chain?.correct).length, group.length),
    String(chain.filter((r) => !r.chain?.correct).length),
  ];
}

/** Step 3 alone, and steps 2–3 together, against the truth: labels, or step 2 where nothing else labels a link. */
function precision(results: readonly BridgeResult[]): string {
  const labelled = results.filter((r) => r.truth);
  return table(
    [
      "Truth",
      "Links",
      "Step 3 right",
      "Step 3 wrong",
      "Step 3 precision",
      "Step 3 recall",
      "Step 3 recall where step 2 misses",
      "Steps 2–3 recall",
      "Steps 2–3 wrong",
    ],
    [
      precisionRow("All labelled", labelled),
      precisionRow(
        "Wikidata or manual label",
        labelled.filter((r) => r.truth?.source !== "MusicBrainz URL relationship"),
      ),
      precisionRow(
        "Step 2's album (unlabelled links)",
        labelled.filter((r) => r.truth?.source === "MusicBrainz URL relationship"),
      ),
    ],
  );
}

function agreement(results: readonly BridgeResult[]): string {
  const both = results.filter((r) => r.agrees !== undefined);
  return `When steps 2 and 3 both find one album, they agree on ${percent(
    both.filter((r) => r.agrees).length,
    both.length,
  )} of links.`;
}

/** Where step 3 ends for each link that reached Spotify, and, for labelled misses, what the album's releases lack. */
function misses(results: readonly BridgeResult[]): string {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const r of results) {
    if (r.error) add(`error: ${r.error}`);
    else if (r.parentFound === false || r.upc === "no-album")
      add("Spotify: no such album or track (404)");
    else if (r.upc === "missing") add("Spotify: album without a UPC");
    else if (r.step3?.outcome === "confident") add("found one album");
    else if (r.step3?.outcome === "needs_input") add("found several albums");
    else if (r.miss?.barcodeFormsMissed)
      add("not found: MusicBrainz has the barcode in another form");
    else if (r.miss && r.miss.withBarcode === 0)
      add("not found: no release of the right album has a barcode");
    else if (r.miss) add("not found: the right album's releases have other barcodes");
    else add("not found: no label, so whether MusicBrainz has the album is unknown");
  }
  const labelledMisses = results.filter((r) => r.miss);
  const rows = [...counts].toSorted((a, b) => b[1] - a[1]).map(([what, n]) => [what, String(n)]);
  return [
    table(["Step 3 for each link", "Links"], rows),
    "",
    `Of the ${labelledMisses.length} misses on albums MusicBrainz has, ${
      labelledMisses.filter((r) => r.miss?.digital === 0).length
    } have no digital release in MusicBrainz at all.`,
  ].join("\n");
}

function tracks(results: readonly BridgeResult[]): string {
  const trackLinks = results.filter((r) => r.kind === "track");
  if (trackLinks.length === 0) return "No track links.";
  const types = new Map<string, number>();
  for (const r of trackLinks) {
    const id = r.chain?.releaseGroupId;
    const album = id ? r.albums[id] : undefined;
    if (!album) continue;
    const type = [album.primaryType ?? "no type", ...album.secondaryTypes].join(" + ");
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  return [
    `Get Track named the parent album for ${percent(
      trackLinks.filter((r) => r.parentFound).length,
      trackLinks.length,
    )} track links.`,
    "",
    table(
      ["Identified album's MusicBrainz type", "Track links"],
      [...types].toSorted((a, b) => b[1] - a[1]).map(([type, n]) => [type, String(n)]),
    ),
  ].join("\n");
}

const albumName = (r: BridgeResult, id: string) => r.albums[id]?.title ?? id;

/** Wrong matches and several-album outcomes, with MusicBrainz's names for what was found and what was right. */
function examples(results: readonly BridgeResult[]): string {
  const rows = results
    .filter(
      (r) => r.step3Correct === false || r.agrees === false || r.step3?.outcome === "needs_input",
    )
    .map((r) => [
      String(r.index + 1),
      r.input.replace(/\?.*$/, ""),
      r.step3?.outcome === "needs_input" ? "several albums" : "wrong album",
      (r.step3?.releaseGroupIds ?? []).map((id) => albumName(r, id)).join("; "),
      (r.truth?.releaseGroupIds ?? []).map((id) => albumName(r, id)).join("; ") || "—",
      r.truth?.source ?? "—",
    ]);
  return rows.length === 0
    ? "None."
    : table(["#", "Link", "Outcome", "Step 3 found", "Right album", "Truth from"], rows);
}

function stats(values: readonly number[]) {
  return values.length === 0
    ? "—"
    : `p50 ${Math.round(percentile(values, 50))} ms, p95 ${Math.round(percentile(values, 95))} ms`;
}

export function cost(requests: readonly SpotifyRequest[]): string {
  const statuses = new Map<string, number>();
  for (const r of requests) {
    const key = `${r.call} ${r.status}`;
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
  }
  const throttles = requests.flatMap((r) => r.throttled ?? []);
  return [
    table(
      ["Call and status", "Requests"],
      [...statuses].toSorted(([a], [b]) => a.localeCompare(b)).map(([key, n]) => [key, String(n)]),
    ),
    "",
    `- Latency: Get Album ${stats(requests.filter((r) => r.call === "album").map((r) => r.ms))}; ` +
      `Get Track ${stats(requests.filter((r) => r.call === "track").map((r) => r.ms))}.`,
    `- 429s: ${throttles.length}${
      throttles.length > 0
        ? ` (${throttles.filter((t) => t.quota).length} QUOTA_EXCEEDED; Retry-After ${throttles
            .map((t) => t.retryAfter)
            .join(", ")} s)`
        : ""
    }.`,
  ].join("\n");
}

export function buildReport(
  results: readonly BridgeResult[],
  spotify: readonly SpotifyRequest[],
  burst?: readonly SpotifyRequest[],
): string {
  const perLink = (kind: "album" | "track") => {
    const group = results.filter((r) => r.kind === kind);
    const calls = group.reduce((sum, r) => sum + r.spotify.calls, 0);
    const mb = group.reduce((sum, r) => sum + r.musicbrainz, 0);
    return `${kind} links: ${(calls / Math.max(1, group.length)).toFixed(2)} Spotify calls and ${(
      mb / Math.max(1, group.length)
    ).toFixed(2)} MusicBrainz requests each, Spotify time ${stats(group.map((r) => r.spotify.ms))}`;
  };
  return [
    "# TON-15 results",
    "",
    "Generated by `tooling/src/spikes/g1-spotify/run.ts`. Spotify values (UPCs, parent album ids) aren't kept.",
    "",
    "## Samples",
    "",
    samples(results),
    "",
    "## Precision and recall",
    "",
    precision(results),
    "",
    agreement(results),
    "",
    "## Where step 3 ends",
    "",
    misses(results),
    "",
    "## Track links",
    "",
    tracks(results),
    "",
    "## Wrong or ambiguous",
    "",
    examples(results),
    "",
    "## Cost",
    "",
    `- ${perLink("album")}.`,
    `- ${perLink("track")}.`,
    `- MusicBrainz requests in all: ${results.reduce((sum, r) => sum + r.musicbrainz, 0)}.`,
    "",
    cost(spotify),
    ...(burst ? ["", `## Burst: ${burst.length} calls back to back`, "", cost(burst)] : []),
    "",
  ].join("\n");
}
