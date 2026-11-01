import { describe, expect, test } from "bun:test";

import {
  artistCreditSchema,
  creditText,
  phrase,
  searchByTitle,
  yearOf,
} from "./musicbrainz-answers";

describe("artist credits", () => {
  test("names joined by their phrases, whether a phrase is missing or null", () => {
    const credit = artistCreditSchema.parse([
      { name: "Simon", joinphrase: " & ", artist: { name: "Paul Simon", "sort-name": null } },
      { name: "Garfunkel", joinphrase: null },
      { name: "!" },
    ]);
    expect(creditText(credit)).toBe("Simon & Garfunkel!");
    expect(creditText(artistCreditSchema.parse(null))).toBe("");
    expect(creditText(undefined)).toBe("");
  });
});

describe("yearOf", () => {
  test("a date's year, at any precision, and none for anything else", () => {
    expect(["1986", "1986-09", "1986-09-17"].map(yearOf)).toEqual([1986, 1986, 1986]);
    expect(["", "0000", "86", "late 1986"].map(yearOf)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(yearOf(null)).toBeUndefined();
    expect(yearOf(undefined)).toBeUndefined();
  });
});

describe("searchByTitle", () => {
  test("by title and artist, then by title alone when that finds nothing", async () => {
    const queries: string[] = [];
    const search = async (query: string) => {
      queries.push(query);
      return query.includes("artist:") ? [] : ["found"];
    };
    expect(
      await searchByTitle("release", { title: 'Say "Hi"', artist: "Mumiy Troll" }, search),
    ).toEqual(["found"]);
    expect(queries).toEqual([
      'release:"Say \\"Hi\\"" AND artist:"Mumiy Troll"',
      'release:"Say \\"Hi\\""',
    ]);
  });

  test("a search by title and artist that finds something is the answer", async () => {
    const queries: string[] = [];
    const found = await searchByTitle("releasegroup", { title: "Икра", artist: "A" }, async (q) => {
      queries.push(q);
      return [q];
    });
    expect(found).toEqual(['releasegroup:"Икра" AND artist:"A"']);
    expect(queries).toHaveLength(1);
    expect(phrase("a\\b")).toBe('"a\\\\b"');
  });
});
