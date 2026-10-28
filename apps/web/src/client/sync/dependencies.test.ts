// Which writes of a request build on earlier ones (FR-13.4, TS-25). Against the server, sync.test.ts.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container, type Mutation } from "@tonaris/domain";

import { dependenciesOf } from "./dependencies";

const containerCreate = (kind: Container["kind"], parentId: string | null = null): Mutation => ({
  mutationId: uuidv7(),
  name: "container.create",
  args: { id: uuidv7(), kind, parentId, name: kind },
});

const idOf = (mutation: Mutation) => (mutation.name === "container.create" ? mutation.args.id : "");

const choice = (viewKey: string): Mutation => ({
  mutationId: uuidv7(),
  name: "view.set",
  args: { viewKey, layout: "grid" },
  base: { layout: null },
});

describe("dependencies within a request", () => {
  test("a list inside a folder created earlier depends on it, and so does what goes in the list", () => {
    const folder = containerCreate("folder");
    const list = containerCreate("list", idOf(folder));
    const elsewhere = containerCreate("list");
    const albumId = uuidv7();
    const album: Mutation = {
      mutationId: uuidv7(),
      name: "album.create",
      args: {
        id: albumId,
        title: "Kind of Blue",
        artistCredit: "Miles Davis",
        releaseType: "album",
        isLive: false,
        originalYear: 1959,
        recordingYearStart: null,
        recordingYearEnd: null,
        artworkUrl: null,
      },
    };
    const entry: Mutation = {
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: idOf(list), albumId },
    };
    expect(dependenciesOf([folder, list, elsewhere, album, entry])).toEqual([
      undefined,
      [folder.mutationId],
      undefined,
      undefined,
      [list.mutationId, album.mutationId],
    ]);
  });

  test("a rename or move of a new record depends on its creation, and a move into a new folder on that", () => {
    const folder = containerCreate("folder");
    const list = containerCreate("list");
    const rename: Mutation = {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id: idOf(list), name: "Later" },
      base: { name: "list" },
    };
    const move: Mutation = {
      mutationId: uuidv7(),
      name: "container.move",
      args: { id: idOf(list), parentId: idOf(folder) },
      base: { parentId: null },
    };
    expect(dependenciesOf([folder, list, rename, move])).toEqual([
      undefined,
      undefined,
      [list.mutationId],
      [list.mutationId, folder.mutationId],
    ]);
  });

  test("nothing depends on a record the request doesn't create, nor on a later write", () => {
    const existing = uuidv7();
    const removal: Mutation = {
      mutationId: uuidv7(),
      name: "membership.remove",
      args: { listId: existing, albumId: uuidv7() },
    };
    const list = containerCreate("list");
    const addition: Mutation = {
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: idOf(list), albumId: uuidv7() },
    };
    expect(dependenciesOf([removal, addition, list])).toEqual([undefined, undefined, undefined]);
  });

  test("a choice for a new list depends on its creation; one for the root or Unsorted on nothing", () => {
    const list = containerCreate("list");
    const defaults: Mutation = {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { grouped: true },
      base: { grouped: false },
    };
    expect(
      dependenciesOf([list, choice(idOf(list)), choice("root"), choice("unsorted"), defaults]),
    ).toEqual([undefined, [list.mutationId], undefined, undefined, undefined]);
  });

  test("a move depends on the creation of its view and of the items it places", () => {
    const folder = containerCreate("folder");
    const list = containerCreate("list", idOf(folder));
    const existing = uuidv7();
    const move: Mutation = {
      mutationId: uuidv7(),
      name: "order.set",
      args: { viewKey: idOf(folder), keys: { [idOf(list)]: "a0", [existing]: "a1" } },
      base: { [idOf(list)]: null, [existing]: null },
    };
    expect(dependenciesOf([folder, list, move])).toEqual([
      undefined,
      [folder.mutationId],
      [folder.mutationId, list.mutationId],
    ]);
  });

  test("a capture into a new list depends on the list's creation", () => {
    const list = containerCreate("list");
    const capture: Mutation = {
      mutationId: uuidv7(),
      name: "album.capture",
      args: {
        albumId: uuidv7(),
        link: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
        listId: idOf(list),
      },
    };
    expect(dependenciesOf([list, capture])).toEqual([undefined, [list.mutationId]]);
  });

  test("a link on a new album depends on the album's creation", () => {
    const albumId = uuidv7();
    const create: Mutation = {
      mutationId: uuidv7(),
      name: "album.create",
      args: {
        id: albumId,
        title: "Bleach",
        artistCredit: "Nirvana",
        releaseType: "album",
        isLive: false,
        originalYear: 1989,
        recordingYearStart: null,
        recordingYearEnd: null,
        artworkUrl: null,
      },
    };
    const link: Mutation = {
      mutationId: uuidv7(),
      name: "link.set",
      args: { albumId, service: "tidal", url: "https://tidal.com/album/1" },
      base: { url: null },
    };
    expect(dependenciesOf([create, link])).toEqual([undefined, [create.mutationId]]);
  });
});
