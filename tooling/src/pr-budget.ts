// Counts a PR description against its word budget (the publish-pr skill). The creator's limits, set on
// 13 November 2026 (TON-202): 80 words for a Bug, Chore or Spike, 120 for a Feature or Design.
// The `Closes TON-n` line, the OpenSpec line and the Claude Code footer aren't counted.
//   bun run pr:budget <file> --type bug        a body written to a file
//   bun run pr:budget --pr 194 --type bug      an open or merged PR's body

import { $ } from "bun";

export const budgets = { bug: 80, chore: 80, spike: 80, feature: 120, design: 120 } as const;
export type IssueType = keyof typeof budgets;

export type Report = {
  words: number;
  characters: number;
  bullets: number;
  budget: number;
  errors: string[];
  warnings: string[];
};

const uncountedLines = [
  /^(?:closes|fixes|refs) TON-\d+/i,
  /^OpenSpec change:/i,
  /^🤖 Generated with/,
  /^<!--.*-->$/,
];

/** Words that pad a description without saying anything (the plain-writing skill). */
const filler = [
  "comprehensive",
  "robust",
  "seamless",
  "seamlessly",
  "leverage",
  "leverages",
  "utilize",
  "utilizes",
  "enhance",
  "enhances",
  "streamline",
  "streamlines",
  "various",
  "this pr",
];

/** The prose a reader reads: the counted lines with Markdown syntax and link targets removed. */
export function countedText(body: string): string {
  return body
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !uncountedLines.some((pattern) => pattern.test(line)))
    .join("\n")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/^#+\s+|^[-*]\s+|^\d+\.\s+|[*`]/gm, "");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function checkBody(body: string, type: IssueType): Report {
  const text = countedText(body);
  const words = countWords(text);
  const budget = budgets[type];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (words > budget) errors.push(`${words} words, over the ${type} budget of ${budget}`);
  if (!/^closes TON-\d+/im.test(body)) errors.push("no `Closes TON-n` line");
  if (body.includes("—")) errors.push("em dash (—): use a period or a comma");
  if (/^#{1,6}\s/m.test(body))
    warnings.push("headings: a body this short reads better without them");
  const lower = text.toLowerCase();
  for (const word of filler) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) warnings.push(`filler: "${word}"`);
  }

  return {
    words,
    characters: text.replaceAll(/\s+/g, " ").trim().length,
    bullets: body.split("\n").filter((line) => /^\s*[-*]\s/.test(line)).length,
    budget,
    errors,
    warnings,
  };
}

function isIssueType(value: string | undefined): value is IssueType {
  return value !== undefined && value in budgets;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const type = option("--type");
  const pr = option("--pr");
  const file = args.find(
    (arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"),
  );

  if (!isIssueType(type) || (!pr && !file)) {
    console.error(
      `Usage: bun run pr:budget <file> | --pr <n>  --type ${Object.keys(budgets).join("|")}`,
    );
    process.exit(2);
  }
  const body = pr
    ? await $`gh pr view ${pr} --json body --jq .body`.text()
    : await Bun.file(file ?? "").text();
  const report = checkBody(body, type);

  console.log(
    `${report.words}/${report.budget} words, ${report.characters} characters, ${report.bullets} bullets (${type}).`,
  );
  for (const warning of report.warnings) console.log(`warning: ${warning}`);
  for (const error of report.errors) console.error(`error: ${error}`);
  if (report.errors.length > 0) process.exit(1);
}
