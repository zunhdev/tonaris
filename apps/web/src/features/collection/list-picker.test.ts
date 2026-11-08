// "Add to a list"'s choices (DS-46, TON-177): suggestions before typing, and matches by path.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container } from "@tonaris/domain";

import {
  findByPath,
  listChoices,
  matchedParts,
  matchLimit,
  suggestions,
  termsOf,
  type ListChoice,
} from "./list-picker";
import { buildTree } from "./tree";

const folder = (name: string, parentId: string | null = null): Container => ({
  id: uuidv7(),
  kind: "folder",
  parentId,
  name,
  description: null,
  color: null,
});
const list = (name: string, parentId: string | null = null): Container => ({
  ...folder(name, parentId),
  kind: "list",
});

const paths = (choices: readonly ListChoice[]) => choices.map(({ path }) => path.join(" › "));

const rock = folder("Русский рок");
const decade = folder("4 2000-2010-е", rock.id);
const metal = folder("Metal");
const zemfira = list("Земфира", decade.id);
const noize = list("Noize MC", decade.id);
const doom = list("Doom", metal.id);
const classicDoom = list("Classic Doom", metal.id);
const later = list("Later");
const tree = buildTree([rock, decade, metal, zemfira, noize, doom, classicDoom, later]);

describe("listChoices", () => {
  test("lists only, not the album's own, by path, with their folders", () => {
    expect(paths(listChoices(tree, [noize.id]))).toEqual([
      "Later",
      "Metal › Classic Doom",
      "Metal › Doom",
      "Русский рок › 4 2000-2010-е › Земфира",
    ]);
  });
});

const at = (minute: number) => ({
  addedAt: `2026-11-07T10:${String(minute).padStart(2, "0")}:00Z`,
});

describe("suggestions", () => {
  const choices = listChoices(tree, []);

  test("lists added to come first, the latest first, then others by path", () => {
    const entries = new Map([
      [doom.id, [at(1), at(5)]],
      [zemfira.id, [at(3)]],
    ]);
    const { recent, others, hidden } = suggestions(choices, entries);
    expect(paths(recent)).toEqual(["Metal › Doom", "Русский рок › 4 2000-2010-е › Земфира"]);
    expect(paths(others)).toEqual([
      "Later",
      "Metal › Classic Doom",
      "Русский рок › 4 2000-2010-е › Noize MC",
    ]);
    expect(hidden).toBe(0);
  });

  test("8 at most, and the rest are counted", () => {
    const many = Array.from({ length: 12 }, (_, n) => list(`List ${String(n).padStart(2, "0")}`));
    const manyChoices = listChoices(buildTree(many), []);
    const entries = new Map(many.slice(0, 10).map((item, n) => [item.id, [at(n)]]));
    const { recent, others, hidden } = suggestions(manyChoices, entries);
    expect(paths(recent)).toEqual(
      ["09", "08", "07", "06", "05", "04", "03", "02"].map((n) => `List ${n}`),
    );
    expect(others).toEqual([]);
    expect(hidden).toBe(4);
  });

  test("with nothing added anywhere, the first 8 by path", () => {
    const { recent, others, hidden } = suggestions(choices, new Map());
    expect(recent).toEqual([]);
    expect(others).toHaveLength(5);
    expect(hidden).toBe(0);
  });
});

describe("findByPath", () => {
  const choices = listChoices(tree, []);

  test("each word must be somewhere in the path, case- and accent-insensitive", () => {
    expect(paths(findByPath(choices, "2000 ЗЕМФ").shown)).toEqual([
      "Русский рок › 4 2000-2010-е › Земфира",
    ]);
    expect(paths(findByPath(choices, "рок").shown)).toEqual([
      "Русский рок › 4 2000-2010-е › Noize MC",
      "Русский рок › 4 2000-2010-е › Земфира",
    ]);
    expect(findByPath(choices, "doom jazz").total).toBe(0);
  });

  test("names matching the whole text come first, prefix before word before the rest", () => {
    const withMetalDoom = listChoices(
      buildTree([metal, doom, classicDoom, list("Doomsday"), list("Kaboom")]),
      [],
    );
    expect(paths(findByPath(withMetalDoom, "doom").shown)).toEqual([
      "Doomsday",
      "Metal › Doom",
      "Metal › Classic Doom",
    ]);
    // "metal" is in the folder's name only: by path.
    expect(paths(findByPath(withMetalDoom, "metal").shown)).toEqual([
      "Metal › Classic Doom",
      "Metal › Doom",
    ]);
  });

  test("blank text finds nothing", () => {
    expect(findByPath(choices, "   ")).toEqual({ shown: [], total: 0 });
  });

  test("at most 50 show, with the total", () => {
    const many = listChoices(buildTree(Array.from({ length: 70 }, (_, n) => list(`Mix ${n}`))), []);
    const { shown, total } = findByPath(many, "mix");
    expect(shown).toHaveLength(matchLimit);
    expect(total).toBe(70);
  });
});

describe("matchedParts", () => {
  test("each word's match, merged, in the name's own spelling", () => {
    expect(matchedParts("Björk Live", termsOf("bjo live"))).toEqual([
      [0, 3],
      [6, 10],
    ]);
    expect(matchedParts("Doom", termsOf("do oo"))).toEqual([[0, 3]]);
    expect(matchedParts("Doom", termsOf("jazz"))).toEqual([]);
  });
});
