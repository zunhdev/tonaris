// Turns the spike's results into the tables TON-14 asks for: hit rates per step and per service, failure
// examples, and the latency of a 50-link batch at 1 request/second.

import type { LinkResult } from "./chain";
import type { Service } from "./links";
import type { RequestRecord } from "./musicbrainz";

const services: readonly Service[] = ["spotify", "apple-music", "qobuz", "tidal", "youtube-music"];
const serviceNames: Record<Service, string> = {
  spotify: "Spotify",
  "apple-music": "Apple Music",
  qobuz: "Qobuz",
  tidal: "Tidal",
  "youtube-music": "YouTube Music",
};

const percent = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} (${Math.round((part / whole) * 100)}%)`;

export function percentile(values: readonly number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN
  );
}

const seconds = (ms: number) => (Number.isNaN(ms) ? "—" : `${(ms / 1000).toFixed(1)} s`);

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function outcomes(results: readonly LinkResult[]): string {
  const columns: [string, (r: LinkResult) => boolean][] = [
    ["0 unsupported", (r) => r.outcome === "unsupported"],
    ["1 existing link", (r) => r.outcome === "existing"],
    ["2 URL: one release", (r) => r.step === 2 && r.outcome === "confident"],
    ["2 URL: several", (r) => r.step === 2 && r.outcome === "needs_input"],
    ["3 barcode: one release", (r) => r.step === 3 && r.outcome === "confident"],
    ["3 barcode: several", (r) => r.step === 3 && r.outcome === "needs_input"],
    ["pending (TON-15/16)", (r) => r.outcome === "pending"],
    ["unresolved", (r) => r.outcome === "unresolved"],
  ];
  const row = (name: string, group: readonly LinkResult[]) => [
    name,
    String(group.length),
    ...columns.map(([, test]) => percent(group.filter(test).length, group.length)),
    percent(
      group.filter((r) => r.outcome === "confident" || r.outcome === "existing").length,
      group.length,
    ),
  ];
  const kinds = (service: Service) =>
    (["album", "track"] as const).map((kind) => {
      const group = results.filter((r) => r.link?.service === service && r.link.kind === kind);
      return row(`${serviceNames[service]} ${kind}`, group);
    });
  return table(
    ["Links", "n", ...columns.map(([name]) => name), "Identified"],
    [
      ...services.flatMap(kinds).filter((r) => r[1] !== "0"),
      row(
        "Unparsed",
        results.filter((r) => !r.link),
      ),
      row("**All**", results),
    ].filter((r) => r[1] !== "0" || r[0] === "**All**"),
  );
}

function urlForms(results: readonly LinkResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const step2 = r.attempts.find((a) => a.step === 2);
    if (!step2 || step2.matched.length === 0 || !r.link) continue;
    for (const url of step2.matched) {
      const form = url
        .replace(r.link.albumId ?? "", "{id}")
        .replace(r.link.slug ?? step2.qobuzSlug ?? "\u0000", "{slug}")
        .replace(r.link.storefront ? `/${r.link.storefront}/` : "\u0000", "/{link's storefront}/");
      lines.push(`${serviceNames[r.link.service]}: \`${form}\``);
    }
  }
  const counts = Map.groupBy(lines, (line) => line);
  return table(
    ["Stored form that matched", "Links"],
    [...counts]
      .toSorted((a, b) => b[1].length - a[1].length)
      .map(([form, hits]) => [form, String(hits.length)]),
  );
}

const idShape = (id: string) =>
  /^\d{13}$/.test(id)
    ? "13 digits"
    : /^\d+$/.test(id)
      ? `${id.length} digits`
      : "letters and digits";

function canonicalOrVariant(results: readonly LinkResult[]): string {
  const rows = services.flatMap((service) => {
    const group = results.filter((r) => r.link?.service === service && r.link.albumId);
    if (group.length === 0) return [];
    const step2 = group.map((r) => r.attempts.find((a) => a.step === 2));
    const hit = step2.filter((a) => a && a.releaseIds.length > 0);
    const canonical = hit.filter((a) => a?.canonicalMatched);
    return [
      [
        serviceNames[service],
        String(group.length),
        percent(canonical.length, group.length),
        percent(hit.length - canonical.length, group.length),
        percent(hit.length, group.length),
      ],
    ];
  });
  return table(
    [
      "Links naming an album",
      "n",
      "Canonical URL (TS-41 as written)",
      "Only another stored form",
      "Step 2 in all",
    ],
    rows,
  );
}

/** One section per sample when the links file has several. */
function perSample(
  results: readonly LinkResult[],
  section: (group: readonly LinkResult[]) => string,
) {
  const samples = Map.groupBy(results, (r) => r.sample ?? "links");
  if (samples.size < 2) return [section(results), ""];
  return [...samples].flatMap(([name, group]) => [`### Sample: ${name}`, "", section(group), ""]);
}

function qobuzIds(results: readonly LinkResult[]): string {
  const albums = results.filter((r) => r.link?.service === "qobuz" && r.link.kind === "album");
  const byShape = Map.groupBy(albums, (r) => idShape(r.link?.albumId ?? ""));
  const rows = [...byShape].map(([name, group]) => {
    const bridged = group.filter((r) => r.step === 3 && r.outcome === "confident");
    const viaUpc = bridged.filter((r) =>
      r.attempts.some((a) => a.step === 3 && a.matched.some((m) => m.length === 12)),
    );
    return [
      name,
      String(group.length),
      percent(group.filter((r) => r.step === 2).length, group.length),
      percent(bridged.length, group.length),
      String(viaUpc.length),
    ];
  });
  return table(
    ["Qobuz album id", "Links", "Found by URL", "Found by barcode", "…as a 12-digit UPC"],
    rows,
  );
}

function enrichment(results: readonly LinkResult[]): string {
  const releases = results.flatMap((r) => (r.release ? [r.release] : []));
  const n = releases.length;
  const live = releases.filter((r) => r.isLive);
  const liveDated = live.filter((r) => r.recordingDates.withRelationshipDates > 0);
  const liveEventOnly = live.filter(
    (r) => r.recordingDates.withRelationshipDates === 0 && r.recordingDates.withEventDatesOnly > 0,
  );
  const noFront = releases.filter((r) => !r.coverFront);
  const types = Map.groupBy(releases, (r) => r.releaseType ?? "Unclassified");
  return table(
    ["Measure", "Identified releases"],
    [
      ["Identified releases", String(n)],
      [
        "Original year (release group's first release date)",
        percent(releases.filter((r) => r.firstReleaseDate).length, n),
      ],
      ["Barcode in MusicBrainz", percent(releases.filter((r) => r.barcode).length, n)],
      ["Cover Art Archive front for the release", percent(n - noFront.length, n)],
      [
        "…otherwise, a front for its release group",
        percent(noFront.filter((r) => r.releaseGroupCover).length, noFront.length),
      ],
      [
        "Classification (TS-45)",
        [...types].map(([type, group]) => `${type} ${group.length}`).join(", "),
      ],
      ["Live (secondary type Live)", percent(live.length, n)],
      ["…with dated recording relationships (TS-46)", percent(liveDated.length, live.length)],
      ["…dated only through the event recorded at", percent(liveEventOnly.length, live.length)],
    ],
  );
}

const distinct = (values: readonly unknown[]) => new Set(values.filter(Boolean)).size;

function failures(results: readonly LinkResult[]): string {
  const sections: string[] = [];
  const show = (title: string, group: readonly LinkResult[], detail: (r: LinkResult) => string) => {
    if (group.length === 0) return;
    sections.push(
      `**${title}** (${group.length})`,
      "",
      ...group.slice(0, 8).map((r) => `- \`${r.input}\`: ${detail(r)}`),
      "",
    );
  };
  show(
    "Unsupported",
    results.filter((r) => r.outcome === "unsupported"),
    (r) => r.reason ?? "",
  );
  show(
    "Unresolved",
    results.filter((r) => r.outcome === "unresolved"),
    (r) => r.reason ?? "",
  );
  show(
    "Several releases (needs input)",
    results.filter((r) => r.outcome === "needs_input"),
    (r) => {
      const candidates = r.attempts.find((a) => a.step === r.step)?.candidates ?? [];
      return (
        `step ${r.step}: ${candidates.length} releases, ${distinct(candidates.map((c) => c.barcode))} barcodes, ` +
        `${distinct(candidates.map((c) => c.date))} dates, countries ${[...new Set(candidates.map((c) => c.country ?? "?"))].join("/")}`
      );
    },
  );
  show(
    "URL known to MusicBrainz without a release",
    results.filter((r) => r.attempts.some((a) => a.step === 2 && (a.withoutRelease ?? 0) > 0)),
    (r) => r.outcome,
  );
  return sections.join("\n");
}

const milliseconds = (values: readonly number[]) =>
  `${Math.round(percentile(values, 50))} / ${Math.round(percentile(values, 95))} ms`;

function latency(
  results: readonly LinkResult[],
  requests: readonly RequestRecord[],
  batch: number,
): string {
  const first = results.slice(0, batch);
  const cached = requests.filter((r) => r.cached).length;
  const live = requests.filter((r) => !r.cached);
  const done = first.map((r) => r.enrichedAtMs ?? r.identifiedAtMs);
  const identified = first.filter((r) => r.outcome === "confident").map((r) => r.identifiedAtMs);
  const enriched = first.flatMap((r) => (r.enrichedAtMs === undefined ? [] : [r.enrichedAtMs]));
  const perLink = first.reduce((sum, r) => sum + r.requests, 0);
  const pair = (values: readonly number[]) =>
    `${seconds(percentile(values, 50))} / ${seconds(percentile(values, 95))}`;
  return [
    cached > 0
      ? `> ${cached} of ${requests.length} MusicBrainz responses came from the cache, so these times understate a live run.\n`
      : "",
    table(
      ["Measure", `First ${first.length} links`],
      [
        ["Batch done (every link decided, identified ones enriched)", seconds(Math.max(...done))],
        ["MusicBrainz requests", String(perLink)],
        ["Requests per link (mean)", (perLink / Math.max(1, first.length)).toFixed(2)],
        ["Identified (one release) after batch start: p50 / p95", pair(identified)],
        ["Enriched after batch start: p50 / p95", pair(enriched)],
        ["MusicBrainz response time: p50 / p95", milliseconds(live.map((r) => r.ms))],
        [
          "Queue wait per request, retries included: p50 / p95",
          milliseconds(live.map((r) => r.totalMs - r.ms)),
        ],
        [
          "Requests that needed a retry after a 503",
          percent(live.filter((r) => r.retries > 0).length, live.length),
        ],
      ],
    ),
  ].join("\n");
}

export function buildReport(
  results: readonly LinkResult[],
  requests: readonly RequestRecord[],
): string {
  return [
    "## Outcomes per service and step",
    "",
    ...perSample(results, outcomes),
    "## Step 2: the canonical URL, or another stored form",
    "",
    ...perSample(results, canonicalOrVariant),
    "## Step 2: URL forms MusicBrainz stores",
    "",
    urlForms(results),
    "",
    "## Step 3: Qobuz album ids as barcodes",
    "",
    qobuzIds(results),
    "",
    "## Enrichment of the identified releases",
    "",
    enrichment(results),
    "",
    "## Failures",
    "",
    failures(results),
    "## Latency at 1 request/second",
    "",
    latency(results, requests, 50),
    "",
  ].join("\n");
}
