// The album limit (FR-15.1 to FR-15.3, TS-18; AC-32): 5,000 albums counting Trash, a new record refused with the
// reason while an edit still works, and restoring reusing its slot. A batch at the limit, refusing each new album
// while its list and link adds go through, is `executeBatch`'s test in packages/db (sync.test.ts).

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import { uuidv7 } from "./ids";
import { maxAlbums } from "./limits";
import type { Principal } from "./principals";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };

const album = (title: string, trashed = false) => ({
  id: uuidv7(),
  title,
  artistCredit: "Sleep",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1999,
  recordingYearStart: null,
  recordingYearEnd: null,
  ownerId: owner,
  trashed,
});

/** A collection of `count` albums, the last `trashed` of them in Trash. */
function full(count: number, trashed = 0) {
  const albums = Array.from({ length: count }, (_, index) =>
    album(`A${index}`, index >= count - trashed),
  );
  const context = memoryStore({ albums });
  const run = (mutation: Mutation): Promise<CommandResult> =>
    runCommand(mutationSchema.parse(mutation), { principal: anna, store: context.store });
  return { ...context, run, albums };
}

const create = (title: string): Mutation => ({
  mutationId: uuidv7(),
  name: "album.create",
  args: {
    id: uuidv7(),
    title,
    artistCredit: "Sleep",
    releaseType: "album",
    isLive: false,
    originalYear: 1999,
    recordingYearStart: null,
    recordingYearEnd: null,
  },
});

describe("the album limit (FR-15.1 to FR-15.3, AC-32)", () => {
  test("albums in Trash count, and a new one past the limit is refused with the reason", async () => {
    const { run, albums } = full(maxAlbums, 37);
    expect(await run(create("One more"))).toMatchObject({
      status: "failed",
      code: "capacity_exceeded",
      problem: {
        detail:
          "You've reached 5,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more.",
      },
    });
    // Everything else still works: editing an album, for one.
    const first = albums[0];
    expect(
      await run({
        mutationId: uuidv7(),
        name: "album.update",
        args: { id: first?.id ?? "", title: "Renamed" },
        base: { title: first?.title ?? "" },
      }),
    ).toMatchObject({ status: "applied" });
  });

  test("one slot left takes one album", async () => {
    const { run } = full(maxAlbums - 1);
    expect(await run(create("The last one"))).toMatchObject({ status: "applied" });
    expect(await run(create("Too many"))).toMatchObject({ code: "capacity_exceeded" });
  });

  test("restoring an album at the limit reuses its slot", async () => {
    const { run, albums } = full(maxAlbums);
    const last = albums.at(-1);
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "album.delete", args: { id: last?.id ?? "", unitId } });
    expect(
      await run({ mutationId: uuidv7(), name: "trash.recover", args: { unitId } }),
    ).toMatchObject({ status: "applied" });
  });
});
