// What a deletion to Trash does (FR-01.11, FR-14.1, FR-07.14, FR-10.6): its roots and what goes with each, the albums
// that fall to Unsorted, who stops seeing it, and the IDs that name nothing active.

import { describe, expect, test } from "bun:test";

import { deletedListsOf, deletionTargetsOf, type DeletionPlace } from "./deletion-targets";
import type { ImpactState } from "./sharing-impact";

const place = (id: string, kind: DeletionPlace["kind"], parentId: string | null = null) => ({
  id,
  kind,
  name: id,
  parentId,
});

const places = [
  place("metal", "folder"),
  place("doom", "list", "metal"),
  place("heavy", "folder", "metal"),
  place("epic", "list", "heavy"),
  place("jazz", "list"),
];
const nobody: ImpactState = {
  containers: places.map(({ id, name, parentId }) => ({ id, name, parentId, trashed: false })),
  people: [],
  links: [],
};

describe("deletion targets (FR-01.11, FR-14.1, FR-10.6)", () => {
  test("a container inside another one deleted goes with it, so only the outer one is a root", () => {
    expect(deletedListsOf(places, ["heavy", "metal"]).toSorted()).toEqual(["doom", "epic"]);
    const targets = deletionTargetsOf({
      places,
      albums: [],
      albumIds: [],
      containerIds: ["heavy", "metal"],
      entries: [],
      state: nobody,
    });
    expect(targets.containerIds).toEqual(["metal"]);
    expect(targets.containers).toEqual([
      { id: "metal", kind: "folder", name: "metal", folders: 1, lists: 2 },
    ]);
    expect(targets.missing).toEqual([]);
  });

  test("an album left in no active list goes to Unsorted, unless it is deleted too", () => {
    const entries = [
      // Only in the deleted list: to Unsorted.
      { albumId: "a", listId: "doom" },
      // Also in a list that stays: stays there.
      { albumId: "b", listId: "doom" },
      { albumId: "b", listId: "jazz" },
      // Also in a list in Trash, which isn't an active place: to Unsorted.
      { albumId: "c", listId: "doom" },
      { albumId: "c", listId: "binned" },
      // Deleted with the list: not counted.
      { albumId: "d", listId: "doom" },
    ];
    const targets = deletionTargetsOf({
      places,
      albums: [{ id: "d", title: "D", artist: "Someone", lists: [{ id: "doom", name: "doom" }] }],
      albumIds: ["d"],
      containerIds: ["doom"],
      entries,
      state: nobody,
    });
    expect(targets.unsorted).toBe(2);
    expect(targets.albums.map((album) => album.id)).toEqual(["d"]);
  });

  test("IDs that are nothing active of the owner's are missing; who sees it now is told", () => {
    const shared: ImpactState = {
      ...nobody,
      people: [{ containerId: "metal", personId: "anna", name: "Anna", pending: false }],
    };
    const targets = deletionTargetsOf({
      places,
      albums: [],
      albumIds: ["gone-album"],
      containerIds: ["epic", "gone-list"],
      entries: [],
      state: shared,
    });
    expect(targets.missing).toEqual(["gone-album", "gone-list"]);
    expect(targets.sharing).toMatchObject([{ kind: "person", id: "anna", via: { id: "metal" } }]);
  });
});
