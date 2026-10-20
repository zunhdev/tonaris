// The album commands against an in-memory store: authorization, required information and field-level
// compare-and-set (TS-21). The database layer runs the same commands inside the owner's write lock (TS-20).

import { describe, expect, test } from "bun:test";

import type { Album, AlbumFields } from "./albums";
import { runCommand, type CollectionStore, type StoredAlbum } from "./commands";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import type { Mutation } from "./sync";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const other: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };

function memoryStore(albums: StoredAlbum[] = []) {
  const rows = new Map(albums.map((album) => [album.id, { ...album }]));
  const store: CollectionStore = {
    findAlbum: (id) => Promise.resolve(rows.has(id) ? { ...rows.get(id)! } : undefined),
    insertAlbum: (album) => {
      rows.set(album.id, { ...album });
      return Promise.resolve();
    },
    updateAlbum: (id, values) => {
      const row = rows.get(id)!;
      const defined = Object.entries(values).filter(([, value]) => value !== undefined);
      rows.set(id, { ...row, ...Object.fromEntries(defined) });
      return Promise.resolve();
    },
  };
  return { store, rows };
}

const kindOfBlue = (values: Partial<AlbumFields> = {}): Album => ({
  id: uuidv7(),
  title: "Kind of Blue",
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: 1959,
  recordingYearEnd: 1959,
  ...values,
});

const create = (args: Album): Mutation => ({ mutationId: uuidv7(), name: "album.create", args });

const update = (id: string, args: Partial<AlbumFields>, base: Partial<AlbumFields>): Mutation => ({
  mutationId: uuidv7(),
  name: "album.update",
  args: { id, ...args },
  base,
});

describe("album.create", () => {
  test("adds the album with the client's ID and logs the insert", async () => {
    const { store, rows } = memoryStore();
    const album = kindOfBlue();
    const result = await runCommand(create(album), { principal: anna, store });
    expect(result).toEqual({
      status: "applied",
      changes: [{ entity: "album", id: album.id, op: "insert", data: album }],
    });
    expect(rows.get(album.id)).toEqual({ ...album, ownerId: owner });
  });

  test("needs a title, an artist and the applicable year (FR-02.6)", async () => {
    const { store, rows } = memoryStore();
    const result = await runCommand(
      create(kindOfBlue({ title: "  ", originalYear: null, isLive: false })),
      { principal: anna, store },
    );
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.code).toBe("required_missing");
    expect(result.problem.status).toBe(422);
    expect(result.problem.errors?.map((error) => error.path)).toEqual(["title", "originalYear"]);
    expect(rows.size).toBe(0);
  });

  test("takes a live album's recording year as its year", async () => {
    const { store } = memoryStore();
    const live = kindOfBlue({
      isLive: true,
      originalYear: null,
      recordingYearStart: 1964,
      recordingYearEnd: 1964,
    });
    expect((await runCommand(create(live), { principal: anna, store })).status).toBe("applied");
  });

  test("never duplicates an album created again (FR-13.5)", async () => {
    const album = kindOfBlue();
    const { store, rows } = memoryStore([{ ...album, ownerId: owner }]);

    const same = await runCommand(create(album), { principal: anna, store });
    expect(same).toEqual({ status: "applied", changes: [] });

    const different = await runCommand(create({ ...album, title: "Sketches of Spain" }), {
      principal: anna,
      store,
    });
    expect(different).toEqual({
      status: "conflict",
      conflicts: [{ field: "title", current: "Kind of Blue", attempted: "Sketches of Spain" }],
    });
    expect(rows.get(album.id)?.title).toBe("Kind of Blue");
  });

  test("refuses an ID another account uses, and guests and read-only connections", async () => {
    const album = kindOfBlue();
    const { store } = memoryStore([
      { ...album, ownerId: other.kind === "user" ? other.userId : "" },
    ]);
    const taken = await runCommand(create(album), { principal: anna, store });
    expect(taken.status === "failed" && taken.code).toBe("validation_failed");

    const guest: Principal = { kind: "guest", linkId: uuidv7(), rootId: uuidv7() };
    const readOnly: Principal = { kind: "mcp", userId: owner, grantId: "g1", mode: "read_only" };
    for (const principal of [guest, readOnly]) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await runCommand(create(kindOfBlue()), { principal, store });
      expect(result.status === "failed" && result.code).toBe("permission_denied");
    }
  });
});

function saved() {
  const album = kindOfBlue();
  return { album, ...memoryStore([{ ...album, ownerId: owner }]) };
}

describe("album.update: field-level compare-and-set (TS-21)", () => {
  test("applies a change whose base matches and logs the whole record", async () => {
    const { album, store, rows } = saved();
    const result = await runCommand(
      update(album.id, { title: "Kind of Blue (Legacy)" }, { title: "Kind of Blue" }),
      { principal: anna, store },
    );
    expect(result).toEqual({
      status: "applied",
      changes: [
        {
          entity: "album",
          id: album.id,
          op: "update",
          data: { ...album, title: "Kind of Blue (Legacy)" },
        },
      ],
    });
    expect(rows.get(album.id)?.title).toBe("Kind of Blue (Legacy)");
  });

  test("keeps the newer saved value and reports current, attempted and base (FR-09.4)", async () => {
    const { album, store, rows } = saved();
    await runCommand(update(album.id, { title: "A" }, { title: "Kind of Blue" }), {
      principal: anna,
      store,
    });
    const stale = await runCommand(
      update(
        album.id,
        { title: "B", originalYear: 1960 },
        { title: "Kind of Blue", originalYear: 1959 },
      ),
      { principal: anna, store },
    );
    expect(stale).toEqual({
      status: "conflict",
      conflicts: [{ field: "title", current: "A", attempted: "B", base: "Kind of Blue" }],
    });
    // Fields submitted together are one change: the year isn't applied either.
    expect(rows.get(album.id)).toMatchObject({ title: "A", originalYear: 1959 });
  });

  test("lets independent edits to different fields both succeed", async () => {
    const { album, store, rows } = saved();
    const first = await runCommand(update(album.id, { title: "A" }, { title: "Kind of Blue" }), {
      principal: anna,
      store,
    });
    const second = await runCommand(
      update(album.id, { originalYear: 1960 }, { originalYear: 1959 }),
      {
        principal: anna,
        store,
      },
    );
    expect([first.status, second.status]).toEqual(["applied", "applied"]);
    expect(rows.get(album.id)).toMatchObject({ title: "A", originalYear: 1960 });
  });

  test("compares nulls as values: clearing a field needs its prior value", async () => {
    const { album, store, rows } = saved();
    const result = await runCommand(
      update(album.id, { releaseType: null }, { releaseType: "album" }),
      {
        principal: anna,
        store,
      },
    );
    expect(result.status).toBe("applied");
    expect(rows.get(album.id)?.releaseType).toBeNull();
    const again = await runCommand(
      update(album.id, { releaseType: "ep" }, { releaseType: "album" }),
      {
        principal: anna,
        store,
      },
    );
    expect(again).toEqual({
      status: "conflict",
      conflicts: [{ field: "releaseType", current: null, attempted: "ep", base: "album" }],
    });
  });

  test("needs a base for exactly the changed fields", async () => {
    const { album, store } = saved();
    const missing = await runCommand(update(album.id, { title: "A" }, {}), {
      principal: anna,
      store,
    });
    const extra = await runCommand(
      update(album.id, { title: "A" }, { title: "Kind of Blue", originalYear: 1959 }),
      { principal: anna, store },
    );
    const nothing = await runCommand(update(album.id, {}, {}), { principal: anna, store });
    for (const result of [missing, extra, nothing]) {
      expect(result.status === "failed" && result.code).toBe("validation_failed");
    }
    expect(missing.status === "failed" && missing.problem.errors).toEqual([
      { path: "base.title", message: "Required" },
    ]);
  });

  test("rejects a change that would leave required information missing", async () => {
    const { album, store, rows } = saved();
    const result = await runCommand(
      update(album.id, { artistCredit: "" }, { artistCredit: "Miles Davis" }),
      {
        principal: anna,
        store,
      },
    );
    expect(result.status === "failed" && result.code).toBe("required_missing");
    expect(rows.get(album.id)?.artistCredit).toBe("Miles Davis");
  });

  test("refuses unknown albums and other people's", async () => {
    const { album, store } = saved();
    const unknown = await runCommand(update(uuidv7(), { title: "A" }, { title: "B" }), {
      principal: anna,
      store,
    });
    expect(unknown.status === "failed" && unknown.code).toBe("not_found");
    const foreign = await runCommand(update(album.id, { title: "A" }, { title: "Kind of Blue" }), {
      principal: other,
      store,
    });
    expect(foreign.status === "failed" && foreign.code).toBe("permission_denied");
  });
});
