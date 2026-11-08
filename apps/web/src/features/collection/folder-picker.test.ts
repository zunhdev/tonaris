// "Find a folder"'s choices (DS-49, DS-56, TON-183): the places by path, Collection first, recent ones before typing,
// and matches by path.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container } from "@tonaris/domain";

import { folderChoices, folderSuggestions, type FolderChoice } from "./folder-picker";
import { findByPath } from "./list-picker";
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

const paths = (choices: readonly FolderChoice[]) => choices.map(({ path }) => path.join(" › "));

const metal = folder("Metal");
const black = folder("Black", metal.id);
const doom = folder("Doom", metal.id);
const jazz = folder("Jazz");
const rock = folder("Русский рок");
const scene = folder("Независимая сцена 2010-х", rock.id);
const rewind = list("Перемотка", scene.id);
const tree = buildTree([metal, doom, black, jazz, rock, scene, rewind]);

describe("folderChoices", () => {
  test("Collection first, then every folder by path, with the folders above it", () => {
    expect(paths(folderChoices(tree))).toEqual([
      "Collection",
      "Jazz",
      "Metal",
      "Metal › Black",
      "Metal › Doom",
      "Русский рок",
      "Русский рок › Независимая сцена 2010-х",
    ]);
  });

  test("moving, only the places that can take it", () => {
    // Not where it is.
    expect(paths(folderChoices(tree, { moving: rewind.id }))).not.toContain(
      "Русский рок › Независимая сцена 2010-х",
    );
    // Not itself, under it, or where it is, the root.
    expect(paths(folderChoices(tree, { moving: metal.id }))).toEqual([
      "Jazz",
      "Русский рок",
      "Русский рок › Независимая сцена 2010-х",
    ]);
  });
});

describe("folderSuggestions", () => {
  const choices = folderChoices(tree, { moving: rewind.id });

  test("Collection, then recent folders, the latest first, then others by path", () => {
    const { collection, recent, others, hidden } = folderSuggestions(choices, [
      doom.id,
      jazz.id,
      doom.id,
    ]);
    expect(collection?.path).toEqual(["Collection"]);
    expect(paths(recent)).toEqual(["Metal › Doom", "Jazz"]);
    expect(paths(others)).toEqual(["Metal", "Metal › Black", "Русский рок"]);
    expect(hidden).toBe(0);
  });

  test("a recent folder that can't take it, or is gone, drops out", () => {
    const { recent } = folderSuggestions(choices, [scene.id, uuidv7(), black.id]);
    expect(paths(recent)).toEqual(["Metal › Black"]);
  });

  test("8 folders in all, and how many more there are", () => {
    const many = Array.from({ length: 12 }, (_, n) =>
      folder(`Folder ${String(n).padStart(2, "0")}`),
    );
    const big = folderChoices(buildTree(many));
    const { collection, recent, others, hidden } = folderSuggestions(big, [many[11]?.id ?? ""]);
    expect(collection).toBeDefined();
    expect(paths(recent)).toEqual(["Folder 11"]);
    expect(others).toHaveLength(7);
    expect(hidden).toBe(4);
  });
});

describe("finding folders", () => {
  const choices = folderChoices(tree);

  test("by the words of their path, those whose name matches first", () => {
    expect(paths(findByPath(choices, "metal black").shown)).toEqual(["Metal › Black"]);
    expect(paths(findByPath(choices, "metal").shown)).toEqual([
      "Metal",
      "Metal › Black",
      "Metal › Doom",
    ]);
    expect(paths(findByPath(choices, "СЦЕНА").shown)).toEqual([
      "Русский рок › Независимая сцена 2010-х",
    ]);
  });

  test("Collection by its name", () => {
    expect(paths(findByPath(choices, "coll").shown)).toEqual(["Collection"]);
  });
});
