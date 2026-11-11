import { describe, expect, test } from "bun:test";
import path from "node:path";

import fixtures from "../fixtures/normalize.json";
import { findNameConflict } from "./names";
import {
  caseFold,
  latinKey,
  matchRange,
  nameKey,
  searchKey,
  searchMatches,
  searchParts,
  searchText,
  searchTier,
} from "./normalize";

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

  test.each(fixtures.latinKey)("latinKey($input) is $key", ({ input, key }) => {
    expect(latinKey(input)).toBe(key);
  });

  test.each(fixtures.search)('"$query" matches "$text": $matches', ({ query, text, matches }) => {
    expect(searchMatches(query, text)).toBe(matches);
    expect(searchTier(latinKey(query), searchText(text)) !== undefined).toBe(matches);
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

/** The tier of `text`'s match for `query`. */
const tier = (query: string, text: string) => searchTier(latinKey(query), searchText(text));

describe("searchTier", () => {
  test("ranks a start, then a word start, then any substring", () => {
    expect(tier("doom", "doom metal")).toBe(0);
    expect(tier("doom", "classic doom")).toBe(1);
    expect(tier("doom", "kaboom-doom")).toBe(1);
    expect(tier("doom", "kadoom")).toBe(2);
    expect(tier("doom", "sludge")).toBeUndefined();
  });

  test("finds a word start after an earlier substring", () => {
    expect(tier("doom", "kadoom doom")).toBe(1);
  });

  test("an empty query matches nothing", () => {
    expect(tier("", "doom")).toBeUndefined();
    expect(tier("ь", "Тролль")).toBeUndefined();
  });

  test("ranks the same across a letter's spellings", () => {
    expect(tier("aerzte", "Die Ärzte")).toBe(1);
    expect(tier("die aer", "Die Ärzte")).toBe(0);
    expect(tier("troll", "Мумий Тролль")).toBe(1);
    expect(tier("mumij", "Мумий Тролль")).toBe(0);
    expect(tier("hor", "Хор")).toBe(0);
  });

  test("a match starting inside a letter's spelling is any substring", () => {
    expect(tier("chedrin", "Щедрин")).toBe(2);
    expect(tier("h", "Ж")).toBe(2);
    expect(tier("e", "Ärzte")).toBe(2);
  });

  test("letters may mix spellings, but each takes one", () => {
    expect(tier("mumii trol", "Мумий Тролль")).toBe(0);
    expect(tier("schtschedrin", "Щедрин")).toBeUndefined();
    expect(tier("aeerzte", "Ärzte")).toBeUndefined();
  });

  test("a Latin letter takes only its own spelling", () => {
    expect(tier("roeyksopp", "Royksopp")).toBeUndefined();
    expect(tier("lin", "Lyn")).toBeUndefined();
    expect(tier("bach", "Vach")).toBeUndefined();
  });
});

describe("latinKey", () => {
  test("is searchKey for text without letters to spell", () => {
    for (const text of [
      "Kind of Blue",
      "  Kind   of\tBlue ",
      "Björk",
      "Straße",
      "ＡＢＣ",
      "İstanbul",
      "坂本龍一",
    ]) {
      expect(latinKey(text)).toBe(searchKey(text));
    }
  });

  test("drops the soft and hard signs", () => {
    expect(latinKey("Тролль")).toBe("troll");
    expect(latinKey("Подъезд")).toBe("podezd");
  });

  test("spells precomposed and decomposed letters alike", () => {
    expect(latinKey("Мумии\u0306")).toBe(latinKey("Мумий"));
    expect(latinKey("Ма\u0308")).toBe(latinKey("Mä"));
  });

  test("keeps a letter's spellings under a stress mark", () => {
    expect(searchMatches("yolka", "Ё\u0301лка")).toBe(true);
    expect(searchMatches("mumij", "Мумий\u0301")).toBe(true);
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

  test("covers the letters a Latin spelling matched", () => {
    expect(highlighted("kino", "Кино")).toBe("Кино");
    expect(highlighted("aerz", "Die Ärzte")).toBe("Ärz");
    expect(highlighted("troll", "Мумий Тролль")).toBe("Тролль");
    expect(highlighted("shch", "Щедрин")).toBe("Щ");
    expect(highlighted("vangelis", "Βαγγέλης")).toBe("Βαγγέλης");
  });

  test("matches latinKey for every fixture and a sample of scripts", () => {
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
      const key = latinKey(text);
      if (key === "") continue;
      expect(matchRange(key, text)).toBeDefined();
    }
  });

  test("no match, no range", () => {
    expect(matchRange("metalica", "Metallica")).toBeUndefined();
    expect(matchRange("", "Metallica")).toBeUndefined();
  });
});

/** Spellings of `text`, choosing each letter's `pick`-th spelling, wrapping. */
function spelledAs(text: string, pick: number): string {
  const { key, letters } = searchText(text);
  if (!letters) return key;
  return letters.map((spellings, index) => spellings[(pick + index) % spellings.length]).join("");
}

describe("any spelling, any part (property)", () => {
  const texts = [
    "Мумий Тролль",
    "Щедрин",
    "Die Ärzte",
    "Røyksopp",
    "Ελευθερία Αρβανιτάκη",
    "Чайф",
    "Ляпис Трубецкой",
    "Хор Турецкого",
    "Океан Ельзи",
    "Mötley Crüe",
    "Đorđe Balašević",
    "Ёлка",
    "Flëur",
  ];

  test("every part of every spelling matches, and holds searchParts in order in the key", () => {
    for (const text of texts) {
      const { key } = searchText(text);
      for (let pick = 0; pick < 5; pick += 1) {
        const spelled = spelledAs(text, pick);
        for (let start = 0; start < spelled.length; start += 1) {
          for (let end = start + 1; end <= Math.min(spelled.length, start + 8); end += 1) {
            const query = spelled.slice(start, end);
            if (latinKey(query) === "") continue;
            expect([query, text, tier(query, text) !== undefined]).toEqual([query, text, true]);
            let at = 0;
            for (const part of searchParts(latinKey(query))) {
              const found = key.indexOf(part, at);
              expect([query, part, found >= 0]).toEqual([query, part, true]);
              at = found + part.length;
            }
          }
        }
      }
    }
  });
});

describe("searchParts", () => {
  test("leaves out what may be another spelling", () => {
    expect(searchParts("aerzte")).toEqual(["rzt"]);
    expect(searchParts("doom")).toEqual(["doom"]);
    expect(searchParts("kino")).toEqual(["k"]);
    expect(searchParts("schedrin")).toEqual(["dr"]);
  });

  test("keeps text no spelling reaches", () => {
    expect(searchParts("%_ 2000")).toEqual(["%_ 2000"]);
  });
});
