import { describe, expect, test } from "bun:test";
import path from "node:path";

import fixtures from "../fixtures/normalize.json";
import { findNameConflict } from "./names";
import { caseFold, nameKey, searchKey, searchMatches } from "./normalize";

describe("parity fixtures", () => {
  test.each(fixtures.nameKey)("nameKey($input) is $key", ({ input, key }) => {
    expect(nameKey(input)).toBe(key);
  });

  test.each(fixtures.sameName)("%p and %p are the same name", (a, b) => {
    expect(nameKey(a)).toBe(nameKey(b));
  });

  test.each(fixtures.differentName)("%p and %p are different names", (a, b) => {
    expect(nameKey(a)).not.toBe(nameKey(b));
  });

  test.each(fixtures.searchKey)("searchKey($input) is $key", ({ input, key }) => {
    expect(searchKey(input)).toBe(key);
  });

  test.each(fixtures.search)('"$query" matches "$text": $matches', ({ query, text, matches }) => {
    expect(searchMatches(query, text)).toBe(matches);
  });

  test.each(fixtures.renames)("renaming to $to", ({ siblings, rename, to, conflictsWith }) => {
    const conflict = findNameConflict(to, siblings, rename ?? undefined);
    expect(conflict?.id ?? null).toBe(conflictsWith);
  });
});

describe("caseFold", () => {
  test("folds ASCII and non-ASCII text", () => {
    expect(caseFold("Metallica")).toBe("metallica");
    expect(caseFold("ẞ ß Σ ς")).toBe("ss ss σ σ");
  });

  // Unicode's own table, committed as a fixture (Unicode terms of use: https://www.unicode.org/terms_of_use.html).
  test("matches Unicode 18 CaseFolding.txt for every code point the engine knows", async () => {
    const table = path.join(import.meta.dir, "../fixtures/CaseFolding-18.0.0.txt");
    const official = new Map<number, string>();
    for (const line of (await Bun.file(table).text()).split("\n")) {
      const match = /^([0-9A-F]+); [CF]; ([0-9A-F ]+);/.exec(line);
      if (!match) continue;
      const target = (match[2] ?? "")
        .split(" ")
        .map((hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
      official.set(Number.parseInt(match[1] ?? "", 16), target.join(""));
    }
    const mismatches: string[] = [];
    for (const [codePoint, folded] of official) {
      const character = String.fromCodePoint(codePoint);
      // Characters newer than the engine's Unicode data stay unchanged; Unicode 18 added a few.
      if (character.toLowerCase() === character && character.toUpperCase() === character) continue;
      if (caseFold(character) !== caseFold(folded)) {
        mismatches.push(
          `U+${codePoint.toString(16).toUpperCase()}: ${caseFold(character)} vs ${folded}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
