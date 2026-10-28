import { describe, expect, test } from "bun:test";
import path from "node:path";

import fixtures from "../fixtures/normalize.json";
import { findNameConflict } from "./names";
import { caseFold, matchRange, nameKey, searchKey, searchMatches, searchTier } from "./normalize";

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
    expect(searchTier(searchKey(query), searchKey(text)) !== undefined).toBe(matches);
    expect(matchRange(query, text) !== undefined).toBe(matches);
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

describe("searchTier", () => {
  test("ranks a start, then a word start, then any substring", () => {
    expect(searchTier("doom", "doom metal")).toBe(0);
    expect(searchTier("doom", "classic doom")).toBe(1);
    expect(searchTier("doom", "kaboom-doom")).toBe(1);
    expect(searchTier("doom", "kadoom")).toBe(2);
    expect(searchTier("doom", "sludge")).toBeUndefined();
  });

  test("finds a word start after an earlier substring", () => {
    expect(searchTier("doom", "kadoom doom")).toBe(1);
  });

  test("an empty query matches nothing", () => {
    expect(searchTier("", "doom")).toBeUndefined();
  });
});

/** The part of `text` that `query` highlights. */
function highlighted(query: string, text: string) {
  const range = matchRange(query, text);
  return range && text.slice(...range);
}

describe("matchRange", () => {
  test("covers the original spelling", () => {
    expect(highlighted("bjork", "Björk")).toBe("Björk");
    expect(highlighted("BJÖ", "Björk")).toBe("Bjö");
    expect(highlighted("metal", "Metallica")).toBe("Metal");
  });

  test("covers a decomposed letter whole", () => {
    const decomposed = "Bjo\u0308rk";
    expect(highlighted("bjo", decomposed)).toBe("Bjo\u0308");
  });

  test("covers characters that fold to several", () => {
    expect(highlighted("ss", "Straße")).toBe("ß");
    expect(highlighted("trass", "Straße")).toBe("traß");
    expect(highlighted("fiv", "ﬁve")).toBe("ﬁv");
  });

  test("maps across collapsed whitespace", () => {
    expect(highlighted("kind of", "  Kind   of\tBlue ")).toBe("Kind   of");
  });

  test("prefers a word start", () => {
    expect(matchRange("doom", "Kadoom Doom")).toEqual([7, 11]);
  });

  test("matches searchKey for every fixture and a sample of scripts", () => {
    const samples = [
      ...fixtures.searchKey.map(({ input }) => input),
      "Мумий Тролль",
      "Σίσυφος",
      "ΣΙΣΥΦΟΣ",
      "Sigur Rós",
      "坂本龍一",
      "한국어",
      "İstanbul",
      "Kılıç",
      "😀 emoji 😀",
      "Ａｌｂｕｍ",
    ];
    for (const text of samples) {
      const key = searchKey(text);
      if (key === "") continue;
      expect(matchRange(key, text)).toBeDefined();
    }
  });

  test("no match, no range", () => {
    expect(matchRange("metalica", "Metallica")).toBeUndefined();
    expect(matchRange("", "Metallica")).toBeUndefined();
  });
});
