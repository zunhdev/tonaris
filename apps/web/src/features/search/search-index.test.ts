// Search over the owned collection (FR-12.1, FR-12.4, FR-12.5; DS-75, TS-50).

import { describe, expect, test } from "bun:test";

import {
  defaultSearchLimit,
  uuidv7,
  type Album,
  type Container,
  type Membership,
} from "@tonaris/domain";
import parity from "@tonaris/domain/fixtures/search.json";

import { buildTree } from "../collection/tree";
import { albumPlace, buildSearchIndex, containerLocation, search } from "./search-index";

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
  description: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description });

const album = (title: string, artistCredit: string): Album => ({
  id: uuidv7(),
  title,
  artistCredit,
  releaseType: "album",
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
});

function indexOf(
  containers: Container[],
  albums: Album[],
  entries: Pick<Membership, "listId" | "albumId">[] = [],
) {
  const entriesByList = new Map<string, Membership[]>();
  for (const { listId, albumId } of entries) {
    const entry = { listId, albumId, addedAt: "2026-10-28T00:00:00.000Z" };
    entriesByList.set(listId, [...(entriesByList.get(listId) ?? []), entry]);
  }
  return buildSearchIndex({
    tree: buildTree(containers),
    albumsById: new Map(albums.map((each) => [each.id, each])),
    entriesByList,
  });
}

const names = (items: readonly (Container | Album)[]) =>
  items.map((each) => ("name" in each ? each.name : each.title));

const metal = container("folder", "Metal");
const doom = container("list", "Doom", metal.id, "heavy and slow");
const classic = container("list", "Classic Doom");
const kaboom = container("list", "Kaboom-doomed");
const doomMetal = container("list", "Doom Metal");
const grunge = container("folder", "Grunge");
const nineties = container("list", "90s", grunge.id);
const favorites = container("list", "Favorites");
const bleach = album("Bleach", "Nirvana");
const nevermind = album("Nevermind", "Nirvana");
const homogenic = album("Homogenic", "Björk");
const metallica = album("Metallica", "Metallica");
const containers = [metal, doom, classic, kaboom, doomMetal, grunge, nineties, favorites];
const albums = [bleach, nevermind, homogenic, metallica];
const index = indexOf(containers, albums, [
  { listId: nineties.id, albumId: bleach.id },
  { listId: favorites.id, albumId: bleach.id },
]);

describe("search", () => {
  test("groups folders, lists and albums", () => {
    const results = search(index, "metal");
    expect(names(results.folders)).toEqual(["Metal"]);
    expect(names(results.lists)).toEqual(["Doom Metal"]);
    expect(names(results.albums)).toEqual(["Metallica"]);
  });

  test("orders a start, then a word start, then any substring, each alphabetically", () => {
    expect(names(search(index, "doom").lists)).toEqual([
      "Doom",
      "Doom Metal",
      "Classic Doom",
      "Kaboom-doomed",
    ]);
  });

  test("matches album titles and artists, ranking by the better", () => {
    expect(names(search(index, "nirvana").albums)).toEqual(["Bleach", "Nevermind"]);
    expect(names(search(index, "bjork").albums)).toEqual(["Homogenic"]);
    expect(names(search(index, "BJÖRK").albums)).toEqual(["Homogenic"]);
  });

  test("doesn't match descriptions, and has no typo tolerance", () => {
    expect(names(search(index, "heavy").lists)).toEqual([]);
    expect(names(search(index, "metalica").albums)).toEqual([]);
  });

  test("a blank query finds nothing", () => {
    const results = search(index, "   ");
    expect([...results.folders, ...results.lists, ...results.albums]).toEqual([]);
  });
});

describe("locations", () => {
  test("a container's parent path, or Collection", () => {
    expect(containerLocation(index.tree, doom)).toBe("Metal");
    expect(containerLocation(index.tree, metal)).toBe("Collection");
  });

  test("an album's first list by path, with its others, or Unsorted", () => {
    expect(albumPlace(index, bleach.id)).toEqual({
      listId: favorites.id,
      path: "Favorites",
      others: 1,
    });
    expect(albumPlace(index, nevermind.id)).toEqual({
      listId: undefined,
      path: "Unsorted",
      others: 0,
    });
  });

  test("a nested list's path", () => {
    const only = indexOf(containers, albums, [{ listId: nineties.id, albumId: bleach.id }]);
    expect(albumPlace(only, bleach.id)).toEqual({
      listId: nineties.id,
      path: "Grunge › 90s",
      others: 0,
    });
  });
});

test("builds and answers within 50 ms a keystroke at 5,000 albums", () => {
  const words = ["doom", "black", "sabbath", "metal", "blue", "kind", "of", "björk", "straße"];
  const many = Array.from({ length: 5_000 }, (_, n) =>
    album(
      `${words[n % words.length]} ${words[(n * 7) % words.length]} ${n}`,
      `Artist ${words[(n * 3) % words.length]} ${n % 400}`,
    ),
  );
  const lists = Array.from({ length: 500 }, (_, n) => container("list", `List ${n}`));
  const entries = many.map((each, n) => ({
    listId: lists[n % lists.length]?.id ?? "",
    albumId: each.id,
  }));
  const started = performance.now();
  const big = indexOf(lists, many, entries);
  const built = performance.now() - started;
  const slowest = Math.max(
    ...["d", "do", "doo", "doom", "b", "bj", "bjo", "s", "1", "artist"].map((query) => {
      const start = performance.now();
      search(big, query);
      return performance.now() - start;
    }),
  );
  expect(built).toBeLessThan(50);
  expect(slowest).toBeLessThan(50);
});

/** The fixture's active part. */
const active = <T extends { trashed?: boolean }>(items: T[]) =>
  items.filter((each) => each.trashed !== true);
const joined = (location: string[], empty: string) => location.join(" › ") || empty;

describe("the parity fixture (X-02, TS-50)", () => {
  // The client holds only active content, so the fixture's Trash isn't on it.
  const refs = new Map<string, string>();
  const idOf = (ref: string) => {
    let id = refs.get(ref);
    if (!id) {
      id = uuidv7();
      refs.set(ref, id);
    }
    return id;
  };
  const fixtureContainers = active(parity.containers).map(
    ({ ref, kind, name, parent, description }): Container => ({
      id: idOf(ref),
      kind: kind === "folder" ? "folder" : "list",
      parentId: parent === null ? null : idOf(parent),
      name,
      description: description ?? null,
    }),
  );
  const activeLists = new Set(fixtureContainers.map(({ id }) => id));
  const fixtureAlbums = active(parity.albums).map(({ ref, title, artist }) =>
    Object.assign(album(title, artist), { id: idOf(ref) }),
  );
  const fixtureEntries = active(parity.albums).flatMap(({ ref, lists }) =>
    lists
      .map((list) => ({ listId: idOf(list), albumId: idOf(ref) }))
      .filter(({ listId }) => activeLists.has(listId)),
  );
  const parityIndex = indexOf(fixtureContainers, fixtureAlbums, fixtureEntries);

  test.each(parity.queries)('"$query"', (expected) => {
    const results = search(parityIndex, expected.query);
    const limit = expected.limit ?? defaultSearchLimit;
    for (const group of ["folders", "lists"] as const) {
      expect(results[group].length).toBe(expected[group].total);
      expect(
        results[group].slice(0, limit).map((each) => ({
          name: each.name,
          location: containerLocation(parityIndex.tree, each),
        })),
      ).toEqual(
        expected[group].items.map(({ name, location }) => ({
          name,
          location: joined(location, "Collection"),
        })),
      );
    }
    expect(results.albums.length).toBe(expected.albums.total);
    expect(
      results.albums.slice(0, limit).map((each) => {
        const { path, others } = albumPlace(parityIndex, each.id);
        return { title: each.title, path, others };
      }),
    ).toEqual(
      expected.albums.items.map(({ title, lists }) => ({
        title,
        path: joined(lists[0] ?? [], "Unsorted"),
        others: Math.max(lists.length - 1, 0),
      })),
    );
  });
});
