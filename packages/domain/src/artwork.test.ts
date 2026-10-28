// An album's artwork URL (FR-03.4, TS-21, TS-103) against an in-memory store: `album.create` makes an album without
// artwork, and `album.setArtwork` sets, replaces and clears it, as an https link, if it is still what the person saw.

import { describe, expect, test } from "bun:test";

import { artworkPath, isArtworkUrl } from "./albums";
import { runCommand } from "./commands";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };
const cover = "https://coverartarchive.org/release-group/f1afec0b/front-500";

const bleach = (artworkUrl: string | null = null) => ({
  id: uuidv7(),
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl,
  ownerId: owner,
});

const setArtwork = (id: string, artworkUrl: string | null, base: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "album.setArtwork",
  args: { id, artworkUrl },
  base: { artworkUrl: base },
});

describe("album.setArtwork (FR-03.4)", () => {
  test("sets, replaces and clears an album's artwork, and tells clients", async () => {
    const album = bleach();
    const memory = memoryStore({ albums: [album] });
    const set = setArtwork(album.id, cover, null);
    expect(mutationSchema.parse(set)).toEqual(set);
    const result = await runCommand(set, { principal: anna, store: memory.store });
    expect(result).toMatchObject({
      status: "applied",
      changes: [{ entity: "album", op: "update", data: { artworkUrl: cover } }],
    });
    if (result.status === "applied") {
      for (const change of result.changes)
        changeSchema.parse({ ...change, seq: 1, mutationId: null });
    }
    expect(memory.albums.get(album.id)?.artworkUrl).toBe(cover);
    expect(memory.provenance.get(album.id)?.get("artworkUrl")?.source).toBe("user");

    const other = "https://images.example/bleach.jpg";
    await runCommand(setArtwork(album.id, other, cover), { principal: anna, store: memory.store });
    expect(memory.albums.get(album.id)?.artworkUrl).toBe(other);
    await runCommand(setArtwork(album.id, null, other), { principal: anna, store: memory.store });
    expect(memory.albums.get(album.id)?.artworkUrl).toBeNull();
  });

  test("a link that isn't https, a changed artwork and someone else's album are refused", async () => {
    const album = bleach(cover);
    const memory = memoryStore({ albums: [album] });
    expect(
      await runCommand(setArtwork(album.id, "http://images.example/a.jpg", cover), {
        principal: anna,
        store: memory.store,
      }),
    ).toMatchObject({ status: "failed", code: "validation_failed" });
    expect(
      await runCommand(setArtwork(album.id, "https://images.example/a.jpg", null), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({
      status: "conflict",
      conflicts: [
        {
          field: "artworkUrl",
          current: cover,
          attempted: "https://images.example/a.jpg",
          base: null,
        },
      ],
    });
    expect(
      await runCommand(setArtwork(album.id, null, cover), { principal: ben, store: memory.store }),
    ).toMatchObject({ status: "failed", code: "permission_denied" });
    expect(memory.albums.get(album.id)?.artworkUrl).toBe(cover);
  });

  test("album.create makes an album without artwork", async () => {
    const memory = memoryStore();
    const { artworkUrl: _, ownerId: __, ...args } = bleach();
    const result = await runCommand(
      { mutationId: uuidv7(), name: "album.create", args },
      { principal: anna, store: memory.store },
    );
    expect(result).toMatchObject({ changes: [{ data: { artworkUrl: null } }] });
  });
});

describe("artwork URLs (TS-103)", () => {
  test("only https links on the default port, without credentials", () => {
    expect(isArtworkUrl(cover)).toBe(true);
    expect(isArtworkUrl("http://images.example/a.jpg")).toBe(false);
    expect(isArtworkUrl("https://user:pass@images.example/a.jpg")).toBe(false);
    expect(isArtworkUrl("https://images.example:8443/a.jpg")).toBe(false);
    expect(isArtworkUrl("not a link")).toBe(false);
  });

  test("the proxy path encodes the URL as base64url of its UTF-8", () => {
    expect(artworkPath("https://a.example/é?x=1", "sig")).toBe(
      `/img/sig/${Buffer.from("https://a.example/é?x=1").toString("base64url")}`,
    );
  });
});
