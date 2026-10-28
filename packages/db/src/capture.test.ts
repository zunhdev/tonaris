// Capture's storage against the local Postgres 18 (TS-13, TS-22, TS-44, TS-121): albums created with their
// provenance and link, re-addition from Trash, claims for mutations that wait on providers, and the reads made
// before the lock.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  trashRetentionDays,
  uuidv7,
  type CaptureSource,
  type FoundFacts,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { maxMergeCandidates, mergeCandidates, savedAlbumsOf } from "./capture";
import { albumProvenance } from "./provenance";
import {
  albums,
  albumServiceLinks,
  containers,
  memberships,
  mutations,
  trashUnits,
  users,
} from "./schema";
import { findLinkedAlbum } from "./service-links";
import {
  claimMutation,
  claimTimeoutMs,
  executeMutation,
  finishMutation,
  findMutationResult,
  mutationRunning,
} from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const bleachId = "f1afec0b-26dd-3db5-9aa1-c91229a74a24";
const spotifyLink = {
  service: "spotify" as const,
  url: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  entityId: "1KQ1Pf4ikoK1jBbOtOHvOv",
};
const bleachFacts: FoundFacts = {
  status: "found",
  askedId: bleachId,
  releaseGroupId: bleachId,
  values: {
    title: { value: "Bleach", source: "musicbrainz", ref: bleachId },
    artistCredit: { value: "Nirvana", source: "musicbrainz", ref: bleachId },
    releaseType: { value: "album", source: "musicbrainz", ref: bleachId },
    isLive: { value: false, source: "musicbrainz", ref: bleachId },
    originalYear: { value: 1989, source: "musicbrainz", ref: bleachId },
  },
};
const identified: CaptureSource = {
  kind: "identified",
  link: spotifyLink,
  facts: bleachFacts,
  merged: [],
};

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

const capture = (listId: string | null = null): Extract<Mutation, { name: "album.capture" }> => ({
  mutationId: uuidv7(),
  name: "album.capture",
  args: { albumId: uuidv7(), link: spotifyLink.url, listId },
});

async function newList(ownerId: string, name: string, trashed = false) {
  const id = uuidv7();
  let trashUnitId: string | null = null;
  if (trashed) {
    trashUnitId = uuidv7();
    await t.db.insert(trashUnits).values({
      id: trashUnitId,
      ownerId,
      kind: "list",
      rootId: id,
      deletedAt: new Date(),
      expiresAt: new Date(Date.now() + trashRetentionDays * 86_400_000),
    });
  }
  await t.db.insert(containers).values({
    id,
    ownerId,
    kind: "list",
    name,
    nameKey: name.toLowerCase(),
    searchNameKey: name.toLowerCase(),
    ...(trashed ? { trashedAt: new Date(), trashUnitId } : {}),
  });
  return id;
}

/** An album saved as `releaseGroupId`, in the lists given, and put in Trash as the G3 spike's deletion does. */
async function savedAlbum(
  ownerId: string,
  {
    title = "Bleach",
    artistCredit = "Nirvana",
    releaseGroupId = bleachId,
    lists = [],
    trashed = false,
  }: {
    title?: string;
    artistCredit?: string;
    releaseGroupId?: string | null;
    lists?: string[];
    trashed?: boolean;
  } = {},
) {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId,
    title,
    artistCredit,
    originalYear: 1989,
    isLive: false,
    mbReleaseGroupId: releaseGroupId,
    searchTitleKey: title.toLowerCase(),
    searchArtistKey: artistCredit.toLowerCase(),
  });
  if (lists.length > 0) {
    await t.db
      .insert(memberships)
      .values(lists.map((listId) => ({ listId, albumId: id, ownerId })));
  }
  if (trashed) {
    const unit = uuidv7();
    await t.db.insert(trashUnits).values({
      id: unit,
      ownerId,
      kind: "album",
      rootId: id,
      deletedAt: new Date(),
      expiresAt: new Date(Date.now() + trashRetentionDays * 86_400_000),
    });
    await t.db
      .update(albums)
      .set({ trashedAt: new Date(), trashUnitId: unit })
      .where(eq(albums.id, id));
  }
  return id;
}

describe("capture's writes", () => {
  test("a new album is saved as its release group, with MusicBrainz's provenance and the link", async () => {
    const principal = await newPrincipal();
    const mutation = capture();
    const { result } = await executeMutation(t.db, principal, mutation, new Date(), {
      capture: identified,
    });
    expect(result.outcome).toMatchObject({ status: "confirmed", result: { match: "created" } });
    const { albumId } = mutation.args;
    const [row] = await t.db.select().from(albums).where(eq(albums.id, albumId));
    expect(row).toMatchObject({ title: "Bleach", originalYear: 1989, mbReleaseGroupId: bleachId });
    expect((await albumProvenance(t.db, albumId)).map((entry) => entry.source)).toEqual(
      Array(5).fill("musicbrainz"),
    );
    expect(await findLinkedAlbum(t.db, principal.userId, "spotify", spotifyLink.entityId)).toBe(
      albumId,
    );
  });

  test("re-addition: the Trash unit goes, active-list entries go, trashed-list entries stay", async () => {
    const principal = await newPrincipal();
    const favorites = await newList(principal.userId, "Favorites");
    const archive = await newList(principal.userId, "Archive", true);
    const albumId = await savedAlbum(principal.userId, {
      lists: [favorites, archive],
      trashed: true,
    });

    const { result, changes } = await executeMutation(t.db, principal, capture(), new Date(), {
      capture: identified,
    });
    expect(result.outcome).toMatchObject({ result: { albumId, match: "restored" } });
    const [row] = await t.db.select().from(albums).where(eq(albums.id, albumId));
    expect(row).toMatchObject({ trashedAt: null, trashUnitId: null });
    expect(await t.db.select().from(trashUnits).where(eq(trashUnits.kind, "album"))).toEqual([]);
    const entries = await t.db.select({ listId: memberships.listId }).from(memberships);
    expect(entries).toEqual([{ listId: archive }]);
    expect(changes).toContainEqual(
      expect.objectContaining({
        entity: "membership",
        op: "delete",
        id: `${favorites}:${albumId}`,
      }),
    );
  });
});

describe("claims (TS-22)", () => {
  test("claimed, then in progress, then finished once and replayed", async () => {
    const principal = await newPrincipal();
    const mutation = capture();
    expect(await claimMutation(t.db, principal, mutation)).toEqual({ status: "claimed" });
    expect(await claimMutation(t.db, principal, mutation)).toEqual({ status: "in_progress" });
    expect(await mutationRunning(t.db, principal.userId, mutation.mutationId)).toBe(true);
    expect(await findMutationResult(t.db, principal.userId, mutation.mutationId)).toBeUndefined();

    const done = await executeMutation(t.db, principal, mutation, new Date(), {
      claimed: true,
      capture: identified,
    });
    expect(done.result.outcome.status).toBe("confirmed");
    const again = await claimMutation(t.db, principal, mutation);
    expect(again).toMatchObject({ status: "answered", executed: { replayed: true } });
    expect(await mutationRunning(t.db, principal.userId, mutation.mutationId)).toBe(false);
    expect(await t.db.select().from(albums)).toHaveLength(1);
  });

  test("an outcome decided before the lock is stored for replay", async () => {
    const principal = await newPrincipal();
    const mutation = capture();
    await claimMutation(t.db, principal, mutation);
    const outcome = { status: "needs_input" as const, need: "details" as const, candidates: [] };
    await finishMutation(t.db, principal, mutation, outcome);
    expect(await findMutationResult(t.db, principal.userId, mutation.mutationId)).toEqual({
      mutationId: mutation.mutationId,
      outcome,
    });
  });

  test("a claim abandoned for 5 minutes is taken again", async () => {
    const principal = await newPrincipal();
    const mutation = capture();
    const then = new Date(Date.now() - claimTimeoutMs - 1_000);
    await claimMutation(t.db, principal, mutation, then);
    expect(await mutationRunning(t.db, principal.userId, mutation.mutationId)).toBe(false);
    expect(await claimMutation(t.db, principal, mutation)).toEqual({ status: "claimed" });
    const [row] = await t.db.select().from(mutations).where(eq(mutations.id, mutation.mutationId));
    expect(row?.receivedAt.getTime()).toBeGreaterThan(then.getTime());
  });

  test("another account's mutation ID is in use, and a claimed one sent unclaimed is too", async () => {
    const principal = await newPrincipal();
    const stranger = await newPrincipal();
    const mutation = capture();
    await claimMutation(t.db, principal, mutation);
    expect(await claimMutation(t.db, stranger, mutation)).toMatchObject({
      status: "answered",
      executed: { result: { outcome: { code: "validation_failed" } } },
    });
    const unclaimed = await executeMutation(t.db, principal, mutation, new Date(), {
      capture: identified,
    });
    expect(unclaimed.result.outcome).toMatchObject({ code: "validation_failed" });
  });
});

describe("reads before the lock (TS-44)", () => {
  test("the saved album of each release group, an active one first", async () => {
    const principal = await newPrincipal();
    await savedAlbum(principal.userId, { trashed: true });
    const active = await savedAlbum(principal.userId);
    expect(await savedAlbumsOf(t.db, principal.userId, [bleachId, uuidv7()])).toEqual(
      new Map([[bleachId, active]]),
    );
  });

  test("merge candidates: the same artist, titles containing one another, Trash included, at most 5", async () => {
    const principal = await newPrincipal();
    const owner = principal.userId;
    const deluxe = await savedAlbum(owner, {
      title: "Shoot for the Stars Aim for the Moon (Deluxe)",
      artistCredit: "Pop Smoke",
      releaseGroupId: "fcd3637b-3365-4780-802d-0013b070bca2",
      trashed: true,
    });
    await savedAlbum(owner, {
      title: "Meet the Woo",
      artistCredit: "Pop Smoke",
      releaseGroupId: uuidv7(),
    });
    await savedAlbum(owner, {
      title: "Shoot for the Stars",
      artistCredit: "Someone Else",
      releaseGroupId: uuidv7(),
    });
    await savedAlbum(owner, {
      title: "Shoot for the Stars Aim for the Moon",
      artistCredit: "Pop Smoke",
      releaseGroupId: null,
    });
    const wanted = {
      releaseGroupId: "d6d1de65-7e43-4277-b723-fc74a2b385e1",
      title: "Shoot for the Stars Aim for the Moon",
      artistCredit: "Pop Smoke",
    };
    expect(await mergeCandidates(t.db, owner, wanted)).toEqual([
      { albumId: deluxe, releaseGroupId: "fcd3637b-3365-4780-802d-0013b070bca2" },
    ]);

    for (let index = 0; index < maxMergeCandidates + 2; index++) {
      // oxlint-disable-next-line no-await-in-loop
      await savedAlbum(owner, {
        title: `Shoot for the Stars Aim for the Moon ${index}`,
        artistCredit: "Pop Smoke",
        releaseGroupId: uuidv7(),
      });
    }
    expect(await mergeCandidates(t.db, owner, wanted)).toHaveLength(maxMergeCandidates);
  });

  test("a link on an active and a trashed album finds the active one (FR-14.3)", async () => {
    const principal = await newPrincipal();
    const owner = principal.userId;
    const trashed = await savedAlbum(owner, { trashed: true });
    const active = await savedAlbum(owner);
    for (const albumId of [trashed, active]) {
      // oxlint-disable-next-line no-await-in-loop
      await t.db.insert(albumServiceLinks).values({ albumId, ownerId: owner, ...spotifyLink });
    }
    expect(await findLinkedAlbum(t.db, owner, "spotify", spotifyLink.entityId)).toBe(active);
  });
});
