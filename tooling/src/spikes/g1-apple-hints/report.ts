// The TON-16 tables: each rule's precision and recall on the labelled Apple links, what the right albums' releases
// fail, and the matches on unlabelled links that need checking by hand.

import { percentile } from "../g1-musicbrainz/report";
import type { MatchResult } from "./match";
import { recommended, rules } from "./rules";

const percent = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} (${Math.round((part / whole) * 100)}%)`;

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function sample(results: readonly MatchResult[]): string {
  const groups = Map.groupBy(results, (r) => r.sample ?? "links");
  return table(
    [
      "Sample",
      "Links",
      "Labelled",
      "Known by URL (step 2)",
      "iTunes hints",
      "Right album in the search",
    ],
    [...groups].map(([name, group]) => {
      const labelled = group.filter((r) => r.truth);
      return [
        name,
        String(group.length),
        String(labelled.length),
        String(group.filter((r) => r.knownByUrl).length),
        String(group.filter((r) => r.hints).length),
        percent(labelled.filter((r) => r.rightAlbumFound).length, labelled.length),
      ];
    }),
  );
}

/**
 * Precision is right / accepted. Recall is right / labelled links, and also right / labelled links with hints:
 * many Wikidata ids aren't in the US or UK store, while a pasted link comes from a store that has the album.
 */
function scores(results: readonly MatchResult[]): string {
  const labelled = results.filter((r) => r.truth);
  const withHints = labelled.filter((r) => r.hints).length;
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

function failures(results: readonly MatchResult[]): string {
  const found = results.filter((r) => r.failed);
  const criteria = [
    ["titleExact", "Title, exactly"],
    ["titleClean", "Title, with edition notes dropped"],
    ["artist", "Artist credit"],
    ["tracks", "Track count"],
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
    if (!d) continue;
    const truth = r.truth?.releaseGroupIds[0];
    const title = (id: string | undefined) => (id && r.albumTitles[id]) || id || "?";
    if (d.outcome === "accepted" && r.truth && !d.correct) {
      lines.push(
        `- Wrong: \`${r.input}\` matched *${title(d.releaseGroupId)}*, but it is *${title(truth)}*.`,
      );
    } else if (d.outcome === "accepted" && !r.truth) {
      lines.push(
        `- Unlabelled, check by hand: \`${r.input}\` matched *${title(d.releaseGroupId)}* (${d.releaseGroupId}).`,
      );
    } else if (d.outcome !== "accepted" && r.truth) {
      const why =
        r.error ??
        (r.rightAlbumFound
          ? `${d.outcome}, ${d.albums} albums passed`
          : "the search didn't find the album");
      lines.push(`- Missed: \`${r.input}\` (*${title(truth)}*): ${why}.`);
    }
  }
  return lines.join("\n");
}

export function buildReport(
  results: readonly MatchResult[],
  mbRequests: number,
  itunesRequests: number,
): string {
  const misses = results.filter((r) => !r.knownByUrl);
  return [
    "## Sample",
    "",
    sample(results),
    "",
    "## Rules on every labelled link",
    "",
    scores(results),
    "",
    "## Rules on the labelled links step 2 misses (what step 4 adds)",
    "",
    scores(misses),
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
    `${mbRequests} MusicBrainz requests and ${itunesRequests} iTunes Lookup calls for ${results.length} links, ` +
      `${results.filter((r) => r.fallbackSearch).length} of them with a title-only fallback search; ` +
      `candidates per search p50 ${percentile(
        results.map((r) => r.candidates),
        50,
      )}, ` +
      `p95 ${percentile(
        results.map((r) => r.candidates),
        95,
      )}.`,
    "",
  ].join("\n");
}
