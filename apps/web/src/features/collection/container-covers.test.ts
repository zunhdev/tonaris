import { describe, expect, test } from "bun:test";

import { appViewDefaults, unsetView, uuidv7, type Album, type Container } from "@tonaris/domain";

import { coversOf, type CoverSources } from "./container-covers";
import { buildTree } from "./tree";

const album = (title: string, originalYear: number): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Led Zeppelin",
  releaseType: "album",
  isLive: false,
  originalYear,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
});
const container = (kind: Container["kind"], name: string, parentId: string | null): Container => ({
  id: uuidv7(),
  kind,
  name,
  parentId,
  description: null,
});

/** An entry added `n` minutes into 1 November 2026. */
const entry = (listId: string, albumId: string, n: number) => ({
  listId,
  albumId,
  addedAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(),
});

/** Rock › Classic Rock › Led Zeppelin (four albums, added newest first) and Rock › Punk › Ramones (one). */
function collection(): {
  sources: CoverSources;
  rock: Container;
  zeppelin: Container;
  titles: string[];
} {
  const rock = container("folder", "Rock", null);
  const classic = container("folder", "Classic Rock", rock.id);
  const zeppelin = container("list", "Led Zeppelin", classic.id);
  const punk = container("folder", "Punk", rock.id);
  const ramones = container("list", "Ramones", punk.id);
  const albums = [
    album("Presence", 1976),
    album("Houses of the Holy", 1973),
    album("Led Zeppelin II", 1969),
    album("Led Zeppelin", 1969),
  ];
  const debut = album("Ramones", 1976);
  return {
    rock,
    zeppelin,
    titles: albums.map((each) => each.title),
    sources: {
      tree: buildTree([rock, classic, zeppelin, punk, ramones]),
      entriesByList: new Map([
        [zeppelin.id, albums.map((each, n) => entry(zeppelin.id, each.id, n))],
        [ramones.id, [entry(ramones.id, debut.id, 0)]],
      ]),
      albumsById: new Map([...albums, debut].map((each) => [each.id, each])),
      views: new Map(),
      defaults: appViewDefaults,
      keys: new Map(),
    },
  };
}

const titles = (albums: readonly Album[]) => albums.map((each) => each.title);

describe("a card's covers (TON-174)", () => {
  test("a list's first three, in its own order: by year by default", () => {
    const { sources, zeppelin } = collection();
    expect(titles(coversOf(zeppelin, sources))).toEqual([
      "Led Zeppelin",
      "Led Zeppelin II",
      "Houses of the Holy",
    ]);
  });

  test("a list sorted by name gives its first by name", () => {
    const { sources, zeppelin } = collection();
    sources.views = new Map([
      [zeppelin.id, { ...unsetView(zeppelin.id), sortMode: "name", sortDir: "desc" }],
    ]);
    expect(titles(coversOf(zeppelin, sources))).toEqual([
      "Presence",
      "Led Zeppelin II",
      "Led Zeppelin",
    ]);
  });

  test("a folder's are found in its folders and lists, top to bottom", () => {
    const { sources, rock } = collection();
    // Manual order, the folders' default: Classic Rock, then Punk, as created.
    expect(titles(coversOf(rock, sources, 5))).toEqual([
      "Led Zeppelin",
      "Led Zeppelin II",
      "Houses of the Holy",
      "Presence",
      "Ramones",
    ]);
  });

  test("an empty list has none", () => {
    const { sources } = collection();
    expect(coversOf(container("list", "Empty", null), sources)).toEqual([]);
  });
});
