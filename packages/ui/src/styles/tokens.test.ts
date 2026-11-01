// The token test (DS-14): contrast targets, the DS-12 values as tuned, no primitives outside tokens.css, and the
// text sizes the class merging knows (DS-13).

import { describe, expect, test } from "bun:test";
import path from "node:path";

import { contrastRatio } from "./color";
import { textSizes } from "./text-sizes";
import { readTokens, tokensPath } from "./tokens";

const tokens = await readTokens();
const surfaces = ["bg-app", "bg-panel", "bg-raised", "bg-hover"];

/** Every pair below its minimum, as `fg on bg: ratio < minimum`; empty when all pass. */
function failures(foregrounds: string[], backgrounds: string[], minimum: number): string[] {
  return foregrounds.flatMap((foreground) =>
    backgrounds.flatMap((background) => {
      const ratio = contrastRatio(tokens.color(foreground), tokens.color(background));
      return ratio < minimum
        ? [`${foreground} on ${background}: ${ratio.toFixed(2)}:1 < ${minimum}:1`]
        : [];
    }),
  );
}

describe("DS-14 contrast targets", () => {
  test("informational text reaches 4.5:1 on every surface", () => {
    expect(failures(["fg-primary", "fg-secondary", "fg-tertiary"], surfaces, 4.5)).toEqual([]);
  });

  test("input borders, the focus ring and status colors reach 3:1 on every surface", () => {
    const boundaries = [
      "border-strong",
      "focus",
      "status-success",
      "status-warning",
      "status-danger",
      "status-info",
    ];
    expect(failures(boundaries, surfaces, 3)).toEqual([]);
  });

  test("primary buttons: the label reaches 4.5:1 on the fill, and the fill 3:1 on the panel", () => {
    expect(failures(["fg-on-accent"], ["accent-fill"], 4.5)).toEqual([]);
    expect(failures(["accent-fill"], ["bg-app", "bg-panel"], 3)).toEqual([]);
  });

  test("a failing pair is reported by name and ratio", () => {
    expect(failures(["fg-disabled"], ["bg-hover"], 4.5)).toEqual([
      expect.stringMatching(/^fg-disabled on bg-hover: \d\.\d\d:1 < 4\.5:1$/),
    ]);
  });
});

describe("semantic tokens", () => {
  // DS-12, with border.strong, accent.fill and fg.on-accent as tuned against DS-14 on 18 October 2026.
  const expected: Record<string, string> = {
    "bg-app": "0.155 0.006 265",
    "bg-panel": "0.185 0.007 265",
    "bg-raised": "0.215 0.008 265",
    "bg-hover": "0.235 0.008 265",
    "bg-selected": "0.26 0.03 275",
    "border-subtle": "0.25 0.008 265",
    "border-strong": "0.52 0.01 265",
    "fg-primary": "0.95 0.004 265",
    "fg-secondary": "0.76 0.008 265",
    "fg-tertiary": "0.64 0.01 265",
    "fg-disabled": "0.46 0.008 265",
    "fg-on-accent": "0.98 0 0",
    "accent-solid": "0.66 0.17 275",
    "accent-fill": "0.54 0.17 275",
    "accent-soft": "0.66 0.17 275 / 0.12",
    "status-success": "0.72 0.15 155",
    "status-warning": "0.8 0.14 80",
    "status-danger": "0.66 0.19 25",
    "status-info": "0.72 0.11 240",
    focus: "0.66 0.17 275",
  };

  test("have the design spec's values", () => {
    const actual = Object.fromEntries(
      Object.keys(expected).map((name) => {
        const { l, c, h, alpha } = tokens.color(name);
        return [name, `${l} ${c} ${h}${alpha < 1 ? ` / ${alpha}` : ""}`];
      }),
    );
    expect(actual).toEqual(expected);
  });

  test("refer only to primitives or other semantic tokens", () => {
    const direct = [...tokens.semantic].filter(([, value]) => !value.startsWith("var(--"));
    expect(direct).toEqual([]);
  });
});

describe("components use semantic tokens only (DS-10)", () => {
  test("no source outside tokens.css references a primitive", async () => {
    const root = path.resolve(import.meta.dir, "../../../..");
    const primitive = new RegExp(`--(${[...tokens.primitives.keys()].join("|")})\\b`);
    // One glob per directory: Bun.Glob doesn't expand braces that contain a path separator.
    const globs = ["packages/ui/src/**/*.{ts,tsx,css}", "apps/web/src/**/*.{ts,tsx,css}"];
    const files = (
      await Promise.all(
        globs.map((glob) => Array.fromAsync(new Bun.Glob(glob).scan({ cwd: root }))),
      )
    )
      .flat()
      .filter((file) => path.resolve(root, file) !== tokensPath && !file.endsWith(".test.ts"));
    const offenders = (
      await Promise.all(
        files.map(async (file) => {
          const match = primitive.exec(await Bun.file(path.join(root, file)).text());
          return match ? [`${file}: ${match[0]}`] : [];
        }),
      )
    ).flat();
    expect(files.length).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });
});

describe("text sizes (DS-13)", () => {
  test("the class merging knows every size tokens.css declares, but input, which Tailwind reads as a color", async () => {
    const css = await Bun.file(tokensPath).text();
    const declared = new Set<string>(
      [...css.matchAll(/--text-([a-z]+):/g)].map(([, name]) => name ?? ""),
    );
    declared.delete("input");
    expect(new Set<string>(textSizes)).toEqual(declared);
  });
});
