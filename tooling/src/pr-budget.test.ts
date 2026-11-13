import { describe, expect, test } from "bun:test";

import { checkBody, countedText, countWords } from "./pr-budget";

const body = [
  "Closes TON-200",
  "",
  "An editor's agent can now delete inside a share.",
  "",
  "- `delete_items` covers shared lists. See [the spec](https://example.com/spec).",
  "",
  "Verified: `bun run check`.",
  "Not verified: by hand in Claude.",
  "",
  "OpenSpec change: none (Bug).",
  "",
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
].join("\n");

describe("countedText", () => {
  test("leaves out the Closes line, the OpenSpec line, the footer and Markdown syntax", () => {
    const text = countedText(body);
    expect(text).not.toContain("TON-200");
    expect(text).not.toContain("OpenSpec");
    expect(text).not.toContain("Generated");
    expect(text).not.toContain("https://");
    expect(text).toContain("delete_items covers shared lists. See the spec.");
  });
});

describe("countWords", () => {
  test("counts words, not punctuation", () => {
    expect(countWords("Verified: bun run check — 204 tests.")).toBe(6);
  });
});

describe("checkBody", () => {
  test("passes a short bug description", () => {
    const report = checkBody(body, "bug");
    expect(report.words).toBe(26);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  test("fails over the budget, without a Closes line, or with an em dash", () => {
    const long = `${body}\n${"word ".repeat(60)}`;
    expect(checkBody(long, "bug").errors).toEqual(["86 words, over the bug budget of 80"]);
    expect(checkBody(long, "feature").errors).toEqual([]);
    expect(checkBody(body.replace("Closes TON-200", ""), "chore").errors).toEqual([
      "no `Closes TON-n` line",
    ]);
    expect(checkBody(`${body}\nOne thing — another.`, "bug").errors).toEqual([
      "em dash (—): use a period or a comma",
    ]);
  });

  test("warns about headings and filler", () => {
    expect(checkBody(`## Why\n${body}\nA robust fix.`, "bug").warnings).toEqual([
      "headings: a body this short reads better without them",
      'filler: "robust"',
    ]);
  });
});
