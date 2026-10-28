// The link commands against an in-memory store (FR-06.2, FR-06.3, TS-21): one test per spec scenario. The API reads
// a link's URL before the lock (TS-40), so these tests hand the commands the link as it would have read it.

import { describe, expect, test } from "bun:test";

import type { CapturedLink } from "./capture";
import { runCommand, type CommandResult } from "./commands";
import { uuidv7 } from "./ids";
import { failure } from "./outcomes";
import type { Principal } from "./principals";
import { serviceLinkKey, type PreparedLink } from "./service-links";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const benPrincipal: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };

const album = () => ({
  id: uuidv7(),
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ownerId: owner,
});

const spotify = (id: string): CapturedLink => ({
  service: "spotify",
  url: `https://open.spotify.com/album/${id}`,
  entityId: id,
});
const bleachSpotify = spotify("1KQ1Pf4ikoK1jBbOtOHvOv");
const otherSpotify = spotify("6jD6Wl5TgtrC8GJkplOtW9");
const tidal: CapturedLink = {
  service: "tidal",
  url: "https://tidal.com/album/1663133",
  entityId: "1663133",
};

const parsed = (link: CapturedLink): PreparedLink => ({ status: "parsed", link });

const set = (
  albumId: string,
  service: CapturedLink["service"],
  url: string,
  base: string | null,
): Mutation => ({
  mutationId: uuidv7(),
  name: "link.set",
  args: { albumId, service, url },
  base: { url: base },
});
const remove = (albumId: string, service: CapturedLink["service"], base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "link.remove",
  args: { albumId, service },
  base: { url: base },
});

function applied(result: CommandResult) {
  if (result.status !== "applied") throw new Error(`Expected applied, got ${result.status}`);
  for (const change of result.changes) {
    changeSchema.parse({ ...change, seq: 1, mutationId: uuidv7() });
  }
  return result;
}

describe("setting a link (FR-06.2, FR-06.3)", () => {
  test("adding a link stores it canonical and tells clients", async () => {
    const bleach = album();
    const memory = memoryStore({ albums: [bleach] });
    const mutation = set(bleach.id, "spotify", `${bleachSpotify.url}?si=abc`, null);
    expect(mutationSchema.parse(mutation)).toEqual(mutation);
    const result = applied(
      await runCommand(mutation, {
        principal: anna,
        store: memory.store,
        link: parsed(bleachSpotify),
      }),
    );
    expect(memory.links.get(serviceLinkKey(bleach.id, "spotify"))).toEqual(bleachSpotify);
    expect(result.changes).toEqual([
      {
        entity: "link",
        id: serviceLinkKey(bleach.id, "spotify"),
        op: "insert",
        data: { albumId: bleach.id, service: "spotify", url: bleachSpotify.url },
      },
    ]);
  });

  test("replacing keeps one link, and the other services' are unchanged", async () => {
    const bleach = album();
    const memory = memoryStore({
      albums: [bleach],
      links: [
        { albumId: bleach.id, ...bleachSpotify },
        { albumId: bleach.id, ...tidal },
      ],
    });
    const result = applied(
      await runCommand(set(bleach.id, "spotify", otherSpotify.url, bleachSpotify.url), {
        principal: anna,
        store: memory.store,
        link: parsed(otherSpotify),
      }),
    );
    expect(result.changes).toEqual([
      {
        entity: "link",
        id: serviceLinkKey(bleach.id, "spotify"),
        op: "update",
        data: { albumId: bleach.id, service: "spotify", url: otherSpotify.url },
      },
    ]);
    expect(memory.links.get(serviceLinkKey(bleach.id, "spotify"))).toEqual(otherSpotify);
    expect(memory.links.get(serviceLinkKey(bleach.id, "tidal"))).toEqual(tidal);
  });

  test("the same link again changes nothing", async () => {
    const bleach = album();
    const memory = memoryStore({
      albums: [bleach],
      links: [{ albumId: bleach.id, ...bleachSpotify }],
    });
    const result = await runCommand(
      set(bleach.id, "spotify", bleachSpotify.url, bleachSpotify.url),
      {
        principal: anna,
        store: memory.store,
        link: parsed(bleachSpotify),
      },
    );
    expect(result).toEqual({ status: "applied", changes: [] });
  });

  test("another service's link is refused, naming both", async () => {
    const bleach = album();
    const memory = memoryStore({ albums: [bleach] });
    const apple: CapturedLink = {
      service: "apple-music",
      url: "https://music.apple.com/us/album/1440828018",
      entityId: "1440828018",
    };
    const result = await runCommand(set(bleach.id, "spotify", apple.url, null), {
      principal: anna,
      store: memory.store,
      link: parsed(apple),
    });
    expect(result).toEqual(
      failure("unsupported_link", "This is an Apple Music link. Paste a Spotify link here."),
    );
    expect(memory.links.size).toBe(0);
  });

  test("unsupported input is refused with the reason reading it gave", async () => {
    const bleach = album();
    const memory = memoryStore({ albums: [bleach] });
    const unread = failure("unsupported_link", "Only Qobuz album and track links can be added.");
    const result = await runCommand(
      set(bleach.id, "qobuz", "https://open.qobuz.com/playlist/1", null),
      { principal: anna, store: memory.store, link: { status: "failed", failure: unread } },
    );
    expect(result).toEqual(unread);
    expect(memory.links.size).toBe(0);
  });

  test("a link changed elsewhere is a conflict, and nothing changes", async () => {
    const bleach = album();
    const memory = memoryStore({
      albums: [bleach],
      links: [{ albumId: bleach.id, ...otherSpotify }],
    });
    const result = await runCommand(set(bleach.id, "spotify", tidal.url, bleachSpotify.url), {
      principal: anna,
      store: memory.store,
      link: parsed(bleachSpotify),
    });
    expect(result).toEqual({
      status: "conflict",
      conflicts: [
        { field: "url", current: otherSpotify.url, attempted: tidal.url, base: bleachSpotify.url },
      ],
    });
    expect(memory.links.get(serviceLinkKey(bleach.id, "spotify"))).toEqual(otherSpotify);
  });

  test("someone else's album is refused, and so is an unread link", async () => {
    const bleach = album();
    const memory = memoryStore({ albums: [bleach] });
    const theirs = await runCommand(set(bleach.id, "spotify", bleachSpotify.url, null), {
      principal: benPrincipal,
      store: memory.store,
      link: parsed(bleachSpotify),
    });
    expect(theirs.status === "failed" && theirs.code).toBe("permission_denied");
    const unread = await runCommand(set(bleach.id, "spotify", bleachSpotify.url, null), {
      principal: anna,
      store: memory.store,
    });
    expect(unread.status === "failed" && unread.code).toBe("validation_failed");
    const missing = await runCommand(set(uuidv7(), "spotify", bleachSpotify.url, null), {
      principal: anna,
      store: memory.store,
      link: parsed(bleachSpotify),
    });
    expect(missing.status === "failed" && missing.code).toBe("not_found");
    expect(memory.links.size).toBe(0);
  });
});

describe("removing a link (FR-06.3)", () => {
  test("removes it, and leaves the other services' links", async () => {
    const bleach = album();
    const memory = memoryStore({
      albums: [bleach],
      links: [
        { albumId: bleach.id, ...bleachSpotify },
        { albumId: bleach.id, ...tidal },
      ],
    });
    const mutation = remove(bleach.id, "tidal", tidal.url);
    expect(mutationSchema.parse(mutation)).toEqual(mutation);
    const result = applied(await runCommand(mutation, { principal: anna, store: memory.store }));
    expect(result.changes).toEqual([
      { entity: "link", id: serviceLinkKey(bleach.id, "tidal"), op: "delete", data: null },
    ]);
    expect([...memory.links.keys()]).toEqual([serviceLinkKey(bleach.id, "spotify")]);
  });

  test("a link replaced elsewhere is a conflict; one already gone changes nothing", async () => {
    const bleach = album();
    const memory = memoryStore({
      albums: [bleach],
      links: [{ albumId: bleach.id, ...otherSpotify }],
    });
    expect(
      await runCommand(remove(bleach.id, "spotify", bleachSpotify.url), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({
      status: "conflict",
      conflicts: [
        { field: "url", current: otherSpotify.url, attempted: null, base: bleachSpotify.url },
      ],
    });
    expect(memory.links.size).toBe(1);
    expect(
      await runCommand(remove(bleach.id, "tidal", tidal.url), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({ status: "applied", changes: [] });
  });

  test("someone else's album is refused", async () => {
    const bleach = album();
    const memory = memoryStore({ albums: [bleach], links: [{ albumId: bleach.id, ...tidal }] });
    const result = await runCommand(remove(bleach.id, "tidal", tidal.url), {
      principal: benPrincipal,
      store: memory.store,
    });
    expect(result.status === "failed" && result.code).toBe("permission_denied");
    expect(memory.links.size).toBe(1);
  });
});
