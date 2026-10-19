// TS-41 step 4 for Qobuz (TON-99): TON-16's rules, fed by a store page's hints instead of iTunes Lookup's. A page
// has no track count, so no rule counts tracks. Two criteria are new: the G2 spike's proposal to match only
// official releases of albums and EPs, and whether Qobuz's version note, such as "(Deluxe Edition)", belongs in
// the title compared.

import { type Candidate, type Decision, decide, type Rule } from "../g1-apple-hints/rules";
import type { QobuzHints } from "./qobuz";

export type QobuzRule = Rule & {
  /** `official` keeps only official releases of albums and EPs (the G2 spike, TON-18). */
  releases: "all" | "official";
  /** `with` compares og:title's title, version note included, instead of the `MusicAlbum` name. */
  version: "without" | "with";
};

const strict: QobuzRule = {
  name: "Clean titles, artist credit, release year, one album",
  accept: "one-album",
  title: "clean",
  artist: "full",
  tracks: "any",
  date: "year",
  releases: "all",
  version: "without",
};
const original: QobuzRule = { ...strict, name: "…release or original year", date: "original" };
const loose: QobuzRule = {
  ...original,
  name: "…loose titles and artist names (TON-16's rule)",
  title: "loose",
  artist: "names",
};
const official: QobuzRule = {
  ...loose,
  name: "…official albums and EPs only (G2's proposal)",
  releases: "official",
};

/** Each rule changes one criterion from the one before, or from the rule it names. */
export const rules: readonly QobuzRule[] = [
  strict,
  original,
  loose,
  official,
  { ...official, name: "…with Qobuz's version note in the title", version: "with" },
  { ...official, name: "…without the year", date: "any" },
];

/** The rule the report recommends and gives examples for. */
export const recommended = official.name;

/** The releases a rule may match. */
export function eligible(rule: QobuzRule, candidates: readonly Candidate[]): Candidate[] {
  if (rule.releases === "all") return [...candidates];
  return candidates.filter(
    (c) => c.status === "Official" && (c.primaryType === "Album" || c.primaryType === "EP"),
  );
}

export function decideQobuz(
  rule: QobuzRule,
  hints: QobuzHints,
  candidates: readonly Candidate[],
): Decision {
  const title = rule.version === "with" ? hints.fullTitle : hints.title;
  return decide(
    rule,
    { title, artist: hints.artist, date: hints.date },
    eligible(rule, candidates),
  );
}
