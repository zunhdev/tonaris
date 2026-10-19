// The TON-99 tables: what the store pages gave, each rule's precision and recall on the labelled Qobuz links, what
// the right albums' releases fail, and what the requests cost.

import { percentile } from "../g1-musicbrainz/report";
import type { MatchResult } from "./match";
import type { QobuzRequest } from "./qobuz";
import { recommended, rules } from "./rules";

const percent = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} (${Math.round((part / whole) * 100)}%)`;
const ms = (values: readonly number[]) =>
  values.length === 0
    ? "—"
    : `${Math.round(percentile(values, 50))} / ${Math.round(percentile(values, 95))} ms`;

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

const bySample = (results: readonly MatchResult[]) =>
  Map.groupBy(results, (r) => r.sample ?? "links");

function sample(results: readonly MatchResult[]): string {
  return table(
    [
      "Sample",
      "Links",
      "Labelled",
      "Known by URL (step 2)",
      "Page hints",
      "Right album in the search",
    ],
    [...bySample(results)].map(([name, group]) => {
      const labelled = group.filter((r) => r.truth);
      return [
        name,
        String(group.length),
        String(labelled.length),
        String(group.filter((r) => r.knownByUrl).length),
        String(group.filter((r) => r.page?.date).length),
        percent(labelled.filter((r) => r.rightAlbumFound).length, labelled.length),
      ];
    }),
  );
}

/** What the pages said, and how their dates relate to MusicBrainz's. */
function pages(results: readonly MatchResult[]): string {
  const withHints = results.filter((r) => r.page?.date);
  const dated = results.filter((r) => r.years);
  const problems = Map.groupBy(
    results.filter((r) => r.page?.problem),
    (r) => r.page?.problem ?? "",
  );
  return [
    table(
      ["Pages", "Links"],
      [
        ["Gave title, artist and date", percent(withHints.length, results.length)],
        ...[...problems].map(([problem, group]) => [`No hints: ${problem}`, String(group.length)]),
        [
          "og:title adds a version note to the name",
          percent(withHints.filter((r) => r.page?.versioned).length, withHints.length),
        ],
        [
          "Date is 1 January (likely year only)",
          percent(
            withHints.filter((r) => r.page?.date?.endsWith("-01-01")).length,
            withHints.length,
          ),
        ],
        [
          "Date is the 1st of a month",
          percent(
            withHints.filter(
              (r) => r.page?.date?.endsWith("-01") && !r.page.date.endsWith("-01-01"),
            ).length,
            withHints.length,
          ),
        ],
      ],
    ),
    "",
    table(
      ["The page's year, where the search found the right album", `Of ${dated.length} links`],
      [
        [
          "Is the album's first year",
          percent(dated.filter((r) => r.years?.original).length, dated.length),
        ],
        [
          "Is the year of one of its releases",
          percent(dated.filter((r) => r.years?.release).length, dated.length),
        ],
        [
          "Is neither",
          percent(
            dated.filter((r) => !r.years?.original && !r.years?.release).length,
            dated.length,
          ),
        ],
      ],
    ),
  ].join("\n");
}

/** Precision is right / accepted. Recall is right / labelled links, and right / labelled links with hints. */
function scores(results: readonly MatchResult[]): string {
  const labelled = results.filter((r) => r.truth);
  const withHints = labelled.filter((r) => r.page?.date).length;
  return table(
    [
      "Rule",
      "Accepted",
      "Right",
      "Wrong",
      "Precision",
      "Recall",
      "Recall with hints",
      "Several",
      "None",
    ],
    rules.map((rule) => {
      const decisions = labelled.map((r) => r.decisions[rule.name]);
      const accepted = decisions.filter((d) => d?.outcome === "accepted");
      const right = accepted.filter((d) => d?.correct).length;
      return [
        rule.name,
        String(accepted.length),
        String(right),
        String(accepted.length - right),
        percent(right, accepted.length),
        percent(right, labelled.length),
        percent(right, withHints),
        String(decisions.filter((d) => d?.outcome === "ambiguous").length),
        String(decisions.filter((d) => !d || d.outcome === "none").length),
      ];
    }),
  );
}

function perSample(results: readonly MatchResult[]): string {
  return table(
    ["Sample", "Labelled", "With hints", "Accepted", "Right", "Wrong", "Several"],
    [...bySample(results)].map(([name, group]) => {
      const labelled = group.filter((r) => r.truth);
      const decisions = labelled.map((r) => r.decisions[recommended]);
      const accepted = decisions.filter((d) => d?.outcome === "accepted");
      return [
        name,
        String(labelled.length),
        String(labelled.filter((r) => r.page?.date).length),
        String(accepted.length),
        String(accepted.filter((d) => d?.correct).length),
        String(accepted.filter((d) => !d?.correct).length),
        String(decisions.filter((d) => d?.outcome === "ambiguous").length),
      ];
    }),
  );
}

function failures(results: readonly MatchResult[]): string {
  const found = results.filter((r) => r.failed);
  const criteria = [
    ["titleExact", "Title, exactly"],
    ["titleClean", "Title, with edition notes dropped"],
    ["artist", "Artist credit"],
    ["releaseDate", "Release date"],
    ["originalYear", "Release year or original year"],
  ] as const;
  return table(
    [
      "No release of the right album matches the…",
      `Of ${found.length} links whose right album the search found`,
    ],
    criteria.map(([key, name]) => [
      name,
      percent(found.filter((r) => r.failed?.[key]).length, found.length),
    ]),
  );
}

function examples(results: readonly MatchResult[], ruleName: string): string {
  const lines: string[] = [];
  for (const r of results) {
    const d = r.decisions[ruleName];
    const truth = r.truth?.releaseGroupIds[0];
    const title = (id: string | undefined) => (id && r.albumTitles[id]) || id || "?";
    if (d?.outcome === "accepted" && r.truth && !d.correct) {
      lines.push(
        `- Wrong: \`${r.input}\` matched *${title(d.releaseGroupId)}*, but it is *${title(truth)}*.`,
      );
    } else if (d?.outcome === "accepted" && !r.truth) {
      lines.push(
        `- Unlabelled, check by hand: \`${r.input}\` matched *${title(d.releaseGroupId)}* (${d.releaseGroupId}).`,
      );
    } else if (d?.outcome !== "accepted" && r.truth) {
      const why =
        r.error ??
        r.page?.problem ??
        (r.rightAlbumFound
          ? `${d?.outcome ?? "none"}, ${d?.albums ?? 0} albums passed`
          : "the search didn't find the album");
      lines.push(`- Missed: \`${r.input}\` (*${title(truth)}*): ${why}.`);
    }
  }
  return lines.join("\n");
}

function requests(
  results: readonly MatchResult[],
  qobuz: readonly QobuzRequest[],
  mbRequests: number,
) {
  const kinds = [
    ["slug", "A: `/us-en/album/-/{id}`, redirect read"],
    ["page", "B: the album page"],
    ["robots", "robots.txt, once per run"],
  ] as const;
  const perLink = Map.groupBy(
    results.filter((r) => r.page),
    (r) => r.page?.requests ?? 0,
  );
  return [
    table(
      ["Qobuz request", "Requests", "Statuses", "Time p50 / p95"],
      kinds.map(([kind, name]) => {
        const done = qobuz.filter((q) => q.kind === kind);
        const statuses = [...Map.groupBy(done, (q) => q.status)]
          .toSorted(([a], [b]) => a - b)
          .map(([status, group]) => `${status} × ${group.length}`)
          .join(", ");
        return [name, String(done.length), statuses || "—", ms(done.map((q) => q.ms))];
      }),
    ),
    "",
    `Requests to www.qobuz.com per link: ${[...perLink]
      .toSorted(([a], [b]) => a - b)
      .map(([count, group]) => `${count} for ${group.length} links`)
      .join(", ")}. ` +
      `${mbRequests} MusicBrainz requests for ${results.length} links, ` +
      `${results.filter((r) => r.fallbackSearch).length} of them with a title-only fallback search; ` +
      `candidates per search p50 ${percentile(
        results.map((r) => r.candidates),
        50,
      )}, p95 ${percentile(
        results.map((r) => r.candidates),
        95,
      )}.`,
  ].join("\n");
}

export function buildReport(
  results: readonly MatchResult[],
  qobuz: readonly QobuzRequest[],
  mbRequests: number,
): string {
  const misses = results.filter((r) => !r.knownByUrl);
  return [
    "## Sample",
    "",
    sample(results),
    "",
    "## What the pages gave",
    "",
    pages(results),
    "",
    "## Rules on every labelled link",
    "",
    scores(results),
    "",
    "## Rules on the labelled links step 2 misses (what step 4 adds)",
    "",
    scores(misses),
    "",
    `## "${recommended}" by sample`,
    "",
    perSample(results),
    "",
    "## What the right album's releases fail",
    "",
    failures(results),
    "",
    `## Examples for "${recommended}"`,
    "",
    examples(results, recommended),
    "",
    "## Requests",
    "",
    requests(results, qobuz, mbRequests),
    "",
  ].join("\n");
}
