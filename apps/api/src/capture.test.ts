// `album.capture` through the API (FR-02.2, FR-02.6, FR-02.9, FR-02.10, FR-02.12, FR-06.4, FR-14.4, TS-22, TS-44):
// AC-07 and AC-09 end to end, with identification and MusicBrainz stubbed. Links are parsed for real; what the chain
// and MusicBrainz answer for them comes from the tables below.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { albumProvenance, mutations, readChanges, trashUnits } from "@tonaris/db";
import {
  batchResultSchema,
  bootstrapSchema,
  captureResultSchema,
  mutationResultSchema,
  trashRetentionDays,
  uuidv7,
  type AlbumFacts,
  type AlbumFields,
  type Batch,
  type Bootstrap,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";
import {
  parseLink,
  ProviderUnavailableError,
  type Identification,
  type ParsedLink,
} from "@tonaris/providers";

import type { CaptureDeps } from "./capture";
import { createTestApp } from "./testing";

const ids = {
  bleach: "f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  lastInLine: "8a7c3f4e-1d2b-3c4d-8e5f-6a7b8c9d0e1f",
  holyDiver: "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  merged: "fcd3637b-3365-4780-802d-0013b070bca2",
  mergedInto: "d6d1de65-7e43-4277-b723-fc74a2b385e1",
  undated: "2c3d4e5f-6071-4829-93a4-b5c6d7e8f901",
};

const links = {
  bleachSpotify: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  bleachDeluxeApple: "https://music.apple.com/us/album/bleach-deluxe-edition/1440835185",
  bleachOtherSpotify: "https://open.spotify.com/album/0000000000000000000001",
  lastInLineTidal: "https://tidal.com/album/77654321",
  shootSpotify: "https://open.spotify.com/album/0000000000000000000002",
  undatedQobuz: "https://open.qobuz.com/album/0000000000013",
  unknownApple: "https://music.apple.com/us/album/1000000001",
};

const parsed = (input: string): ParsedLink => {
  const result = parseLink(input);
  if (result.status !== "parsed") throw new Error(`Not a parsed link: ${input}`);
  return result.link;
};

/** What the chain answers for each link, as TON-42 would. */
const identifications: Record<string, (link: ParsedLink) => Identification> = {
  [links.bleachSpotify]: (link) => ({
    status: "identified",
    link,
    step: 2,
    releaseGroupId: ids.bleach,
  }),
  [links.bleachDeluxeApple]: (link) => ({
    status: "identified",
    link,
    step: 2,
    releaseGroupId: ids.bleach,
  }),
  [links.bleachOtherSpotify]: (link) => ({
    status: "identified",
    link,
    step: 3,
    releaseGroupId: ids.bleach,
  }),
  [links.lastInLineTidal]: (link) => ({
    status: "ambiguous",
    link,
    step: 4,
    candidates: [
      { releaseGroupId: ids.lastInLine, title: "The Last in Line" },
      { releaseGroupId: ids.holyDiver, title: "Holy Diver" },
    ],
  }),
  [links.shootSpotify]: (link) => ({
    status: "identified",
    link,
    step: 2,
    releaseGroupId: ids.mergedInto,
  }),
  [links.undatedQobuz]: (link) => ({
    status: "identified",
    link,
    step: 3,
    releaseGroupId: ids.undated,
  }),
  [links.unknownApple]: (link) => ({
    status: "unidentified",
    link,
    reason: "Tonaris couldn't find this album in MusicBrainz. Enter its details; the link is kept.",
    prefill: {
      source: "itunes-lookup",
      values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
    },
  }),
};

function found(
  releaseGroupId: string,
  values: Partial<AlbumFields>,
  askedId = releaseGroupId,
): AlbumFacts {
  return {
    status: "found",
    askedId,
    releaseGroupId,
    values: Object.fromEntries(
      Object.entries(values).map(([field, value]) => [
        field,
        { value, source: "musicbrainz", ref: releaseGroupId },
      ]),
    ),
  };
}

const album = (title: string, artistCredit: string, originalYear: number | null) => ({
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  ...(originalYear === null ? {} : { originalYear }),
});

/** What MusicBrainz answers for each release group. The merged one answers under its new id. */
const facts: Record<string, AlbumFacts> = {
  [ids.bleach]: found(ids.bleach, album("Bleach", "Nirvana", 1989)),
  [ids.lastInLine]: found(ids.lastInLine, album("The Last in Line", "Dio", 1984)),
  [ids.holyDiver]: found(ids.holyDiver, album("Holy Diver", "Dio", 1983)),
  [ids.mergedInto]: found(
    ids.mergedInto,
    album("Shoot for the Stars Aim for the Moon", "Pop Smoke", 2020),
  ),
  [ids.merged]: found(
    ids.mergedInto,
    album("Shoot for the Stars Aim for the Moon", "Pop Smoke", 2020),
    ids.merged,
  ),
  [ids.undated]: found(ids.undated, album("Untitled", "Someone", null)),
};

/** The stubbed capture, with a gate a test can hold MusicBrainz at. */
function stubs() {
  const reached = Promise.withResolvers<void>();
  let gate: Promise<void> = Promise.resolve();
  let down = false;
  const asked: string[] = [];
  const matchAsked: string[] = [];
  const deps: CaptureDeps = {
    identify: async (input, context) => {
      const link = parsed(input);
      const linked = await context.linked(link.service, link.albumId ?? link.id);
      if (linked) return { status: "linked", link, albumId: linked };
      const answer = identifications[input];
      if (!answer) throw new Error(`No identification for ${input}`);
      return answer(link);
    },
    describe: async (releaseGroupId) => {
      asked.push(releaseGroupId);
      reached.resolve();
      await gate;
      if (down) throw new ProviderUnavailableError("musicbrainz", "MusicBrainz was busy");
      return facts[releaseGroupId] ?? { status: "deleted", askedId: releaseGroupId };
    },
    // Any agent's details would match Bleach (TON-111).
    matchDetails: async ({ title }) => {
      matchAsked.push(title);
      return ids.bleach;
    },
  };
  return {
    deps,
    asked,
    matchAsked,
    /** Resolves once MusicBrainz is first asked. */
    reached: reached.promise,
    /** Holds MusicBrainz's answers until the returned function is called. */
    hold() {
      const held = Promise.withResolvers<void>();
      gate = held.promise;
      return held.resolve;
    },
    breakDown() {
      down = true;
    },
  };
}

let stub: ReturnType<typeof stubs>;
let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;
let accountId: string;

beforeEach(async () => {
  stub = stubs();
  t = await createTestApp({ capture: stub.deps });
  ({ id: accountId, cookie } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

type CaptureArgs = Extract<Mutation, { name: "album.capture" }>["args"];

const capture = (
  link: string,
  listId: string | null = null,
  extra: Partial<CaptureArgs> = {},
): Extract<Mutation, { name: "album.capture" }> => ({
  mutationId: uuidv7(),
  name: "album.capture",
  args: { albumId: uuidv7(), link, listId, ...extra },
});

async function send(mutation: Mutation): Promise<MutationResult> {
  const response = await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json());
}

async function bootstrap(): Promise<Bootstrap> {
  const response = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
  return bootstrapSchema.parse(await response.json());
}

async function newList(name: string): Promise<string> {
  const id = uuidv7();
  const { outcome } = await send({
    mutationId: uuidv7(),
    name: "container.create",
    args: { id, kind: "list", parentId: null, name },
  });
  expect(outcome.status).toBe("confirmed");
  return id;
}

const listsOf = (snapshot: Bootstrap, albumId: string) =>
  snapshot.memberships
    .filter((entry) => entry.albumId === albumId)
    .map((entry) => entry.listId)
    .toSorted();

/** Puts the album in Trash as the G3 spike's deletion does: its own unit, its entries kept. */
async function trash(albumId: string): Promise<void> {
  const unit = uuidv7();
  await t.db.insert(trashUnits).values({
    id: unit,
    ownerId: accountId,
    kind: "album",
    rootId: albumId,
    deletedAt: new Date(),
    expiresAt: new Date(Date.now() + trashRetentionDays * 86_400_000),
  });
  await t.db
    .$client`update albums set trashed_at = now(), trash_unit_id = ${unit} where id = ${albumId}`;
}

const result = (outcome: MutationResult["outcome"]) => {
  if (outcome.status !== "confirmed") throw new Error(`Expected confirmed, got ${outcome.status}`);
  return captureResultSchema.parse(outcome.result);
};

describe("capturing a new album (FR-02.2, AC-07)", () => {
  test("without a list, it is created from MusicBrainz's values and appears in Unsorted", async () => {
    const mutation = capture(links.bleachSpotify);
    const { outcome } = await send(mutation);
    expect(result(outcome)).toEqual({
      albumId: mutation.args.albumId,
      match: "created",
      alreadyInList: false,
      keptLink: null,
    });
    const snapshot = await bootstrap();
    expect(snapshot.albums).toEqual([
      expect.objectContaining({ title: "Bleach", artistCredit: "Nirvana", originalYear: 1989 }),
    ]);
    expect(snapshot.memberships).toEqual([]);
    // The owner's sessions get the new album, and its link, on the stream (TON-46).
    expect(await readChanges(t.db, accountId, 0, 10)).toEqual([
      expect.objectContaining({ entity: "album", op: "insert", mutationId: mutation.mutationId }),
      expect.objectContaining({
        entity: "link",
        op: "insert",
        data: { albumId: mutation.args.albumId, service: "spotify", url: links.bleachSpotify },
      }),
    ]);
    expect(snapshot.links).toEqual([
      { albumId: mutation.args.albumId, service: "spotify", url: links.bleachSpotify },
    ]);
  });
});

describe("a confident match reuses the saved album (FR-02.9, FR-02.12, AC-09)", () => {
  test("another edition's link reuses it and puts it in the list, and the link is added", async () => {
    const first = result((await send(capture(links.bleachSpotify))).outcome);
    const grunge = await newList("Grunge");
    const second = result((await send(capture(links.bleachDeluxeApple, grunge))).outcome);
    expect(second).toEqual({
      albumId: first.albumId,
      match: "reused",
      alreadyInList: false,
      keptLink: null,
    });
    const snapshot = await bootstrap();
    expect(snapshot.albums).toHaveLength(1);
    expect(listsOf(snapshot, first.albumId)).toEqual([grunge]);

    const again = result((await send(capture(links.bleachDeluxeApple, grunge))).outcome);
    expect(again).toMatchObject({ match: "reused", alreadyInList: true });
  });

  test("a different link for the same service is kept, and the list still applied (FR-06.4)", async () => {
    const first = result((await send(capture(links.bleachSpotify))).outcome);
    const grunge = await newList("Grunge");
    const other = result((await send(capture(links.bleachOtherSpotify, grunge))).outcome);
    expect(other).toMatchObject({
      albumId: first.albumId,
      keptLink: { service: "spotify", kept: links.bleachSpotify, pasted: links.bleachOtherSpotify },
    });
    expect(listsOf(await bootstrap(), first.albumId)).toEqual([grunge]);
  });

  test("a kept link is replaced by an explicit edit, and the entry stays (FR-06.4, AC-19)", async () => {
    const first = result((await send(capture(links.bleachSpotify))).outcome);
    const grunge = await newList("Grunge");
    const { keptLink } = result((await send(capture(links.bleachOtherSpotify, grunge))).outcome);
    if (!keptLink) throw new Error("Expected a kept link");
    const { outcome } = await send({
      mutationId: uuidv7(),
      name: "link.set",
      args: { albumId: first.albumId, service: keptLink.service, url: keptLink.pasted },
      base: { url: keptLink.kept },
    });
    expect(outcome.status).toBe("confirmed");
    const snapshot = await bootstrap();
    expect(snapshot.links).toEqual([
      { albumId: first.albumId, service: "spotify", url: links.bleachOtherSpotify },
    ]);
    expect(listsOf(snapshot, first.albumId)).toEqual([grunge]);
  });

  test("a saved album under a release group MusicBrainz merged into this one is reused, under the new id (TS-44)", async () => {
    const old = result(
      (
        await send(
          capture(links.unknownApple, null, {
            details: {
              title: "Shoot for the Stars Aim for the Moon (Deluxe)",
              artistCredit: "Pop Smoke",
              releaseType: "album",
              isLive: false,
              originalYear: 2020,
              recordingYearStart: null,
              recordingYearEnd: null,
            },
          }),
        )
      ).outcome,
    );
    // Saved as the release group MusicBrainz has since merged away.
    await t.db
      .$client`update albums set mb_release_group_id = ${ids.merged} where id = ${old.albumId}`;

    const reused = result((await send(capture(links.shootSpotify))).outcome);
    expect(reused).toMatchObject({ albumId: old.albumId, match: "reused" });
    expect(stub.asked).toContain(ids.merged);
    const [row] = await t.db
      .$client`select mb_release_group_id from albums where id = ${old.albumId}`;
    expect(row?.mb_release_group_id).toBe(ids.mergedInto);
    expect((await bootstrap()).albums).toHaveLength(1);
  });
});

describe("re-addition from Trash (FR-14.4, AC-07)", () => {
  test("into a list: it leaves Trash, and only that list is applied", async () => {
    const favorites = await newList("Favorites");
    const lateNight = await newList("Late night");
    const saved = result((await send(capture(links.bleachSpotify, favorites))).outcome);
    await send({
      mutationId: uuidv7(),
      name: "membership.add",
      args: { listId: lateNight, albumId: saved.albumId },
    });
    await trash(saved.albumId);

    const restored = result((await send(capture(links.bleachDeluxeApple, lateNight))).outcome);
    expect(restored).toMatchObject({
      albumId: saved.albumId,
      match: "restored",
      alreadyInList: false,
    });
    expect(listsOf(await bootstrap(), saved.albumId)).toEqual([lateNight]);
    const [row] = await t.db.$client`select trashed_at from albums where id = ${saved.albumId}`;
    expect(row?.trashed_at).toBeNull();
  });
});

describe("uncertain matches wait unapplied (FR-02.10, AC-09)", () => {
  test("two albums fit: nothing is saved, and the answer names both, with the one already saved", async () => {
    const { outcome } = await send(capture(links.lastInLineTidal));
    expect(outcome).toEqual({
      status: "needs_input",
      need: "match",
      candidates: [
        { releaseGroupId: ids.lastInLine, title: "The Last in Line", albumId: null },
        { releaseGroupId: ids.holyDiver, title: "Holy Diver", albumId: null },
      ],
    });
    expect((await bootstrap()).albums).toEqual([]);
  });

  test("the person's choice is saved; a choice the link doesn't offer asks again", async () => {
    const offered = await send(
      capture(links.lastInLineTidal, null, { releaseGroupId: ids.bleach }),
    );
    expect(offered.outcome).toMatchObject({ status: "needs_input", need: "match" });

    const chosen = result(
      (await send(capture(links.lastInLineTidal, null, { releaseGroupId: ids.lastInLine })))
        .outcome,
    );
    expect(chosen.match).toBe("created");
    expect((await bootstrap()).albums).toEqual([
      expect.objectContaining({ title: "The Last in Line" }),
    ]);
  });

  test("in a batch, the other items are saved", async () => {
    const batch: Batch = {
      batchId: uuidv7(),
      items: [
        capture(links.lastInLineTidal),
        capture(links.bleachSpotify),
        capture(links.shootSpotify),
      ],
    };
    const response = await t.call("/v1/batches", { json: batch, headers: { cookie } });
    const { items } = batchResultSchema.parse(await response.json());
    expect(items.map((item) => item.outcome.status)).toEqual([
      "needs_input",
      "confirmed",
      "confirmed",
    ]);
    expect((await bootstrap()).albums).toHaveLength(2);
  });
});

describe("an automated addition missing its year asks for it (FR-02.6, AC-08)", () => {
  test("nothing is saved; with the details, it is, as the release group, with the offered values' sources", async () => {
    const { outcome } = await send(capture(links.undatedQobuz));
    expect(outcome).toMatchObject({
      status: "needs_input",
      need: "details",
      candidates: [
        { service: "qobuz", prefill: { source: "musicbrainz", values: { title: "Untitled" } } },
      ],
    });
    expect((await bootstrap()).albums).toEqual([]);

    const details: AlbumFields = {
      title: "Untitled",
      artistCredit: "Someone",
      releaseType: "album",
      isLive: false,
      originalYear: 2001,
      recordingYearStart: null,
      recordingYearEnd: null,
    };
    const saved = result((await send(capture(links.undatedQobuz, null, { details }))).outcome);
    const sources = Object.fromEntries(
      (await albumProvenance(t.db, saved.albumId)).map((entry) => [entry.field, entry.source]),
    );
    expect(sources).toMatchObject({ title: "musicbrainz", originalYear: "user" });
    const [row] = await t.db
      .$client`select mb_release_group_id from albums where id = ${saved.albumId}`;
    expect(row?.mb_release_group_id).toBe(ids.undated);
  });
});

describe("details given in the app aren't looked up (FR-02.4, TON-111)", () => {
  test("they're saved as entered, with no release group, where an agent's would match", async () => {
    const details: AlbumFields = {
      title: "Bleach",
      artistCredit: "Nirvana",
      releaseType: null,
      isLive: null,
      originalYear: 1989,
      recordingYearStart: null,
      recordingYearEnd: null,
    };
    const mutation = capture(links.unknownApple, null, { details });
    expect(result((await send(mutation)).outcome).match).toBe("created");
    expect(stub.matchAsked).toEqual([]);
    const [row] = await t.db.$client<{ mb_release_group_id: string | null }[]>`
      select mb_release_group_id from albums where id = ${mutation.args.albumId}`;
    expect(row?.mb_release_group_id).toBeNull();
  });
});

describe("a capture still running says so (TS-22)", () => {
  test("sent again and looked up while running: 409 in_progress; then the outcome, saved once", async () => {
    const release = stub.hold();
    const mutation = capture(links.bleachSpotify);
    const first = t.call("/v1/mutations", { json: mutation, headers: { cookie } });
    // Let the first claim it and reach MusicBrainz.
    await stub.reached;

    const again = await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "in_progress" });
    const lookup = await t.call(`/v1/mutations/${mutation.mutationId}`, { headers: { cookie } });
    expect(lookup.status).toBe(409);

    release();
    const done = mutationResultSchema.parse(await (await first).json());
    expect(done.outcome.status).toBe("confirmed");
    const after = await t.call(`/v1/mutations/${mutation.mutationId}`, { headers: { cookie } });
    expect(mutationResultSchema.parse(await after.json())).toEqual(done);
    expect((await bootstrap()).albums).toHaveLength(1);
  });

  test("MusicBrainz unavailable fails the capture, writing nothing", async () => {
    stub.breakDown();
    const { outcome } = await send(capture(links.bleachSpotify));
    expect(outcome).toMatchObject({ status: "failed", code: "provider_unavailable" });
    expect((await bootstrap()).albums).toEqual([]);
  });
});

describe("the capture limit (TS-18)", () => {
  test("after 100 captures in an hour, another is refused before any provider is asked", async () => {
    const receivedAt = new Date(Date.now() - 10 * 60_000);
    await t.db.insert(mutations).values(
      Array.from({ length: 100 }, () => ({
        id: uuidv7(),
        accountId,
        principal: "user:web",
        name: "album.capture",
        status: "confirmed",
        result: null,
        receivedAt,
      })),
    );
    const refused = await send(capture(links.bleachSpotify));
    expect(refused.outcome).toMatchObject({
      status: "failed",
      code: "rate_limited",
      problem: {
        detail:
          "You've added 100 albums from links in the last hour. Try again later, or enter an album manually.",
      },
    });
    expect((await bootstrap()).albums).toEqual([]);

    // An hour on, it goes through.
    await t.db.update(mutations).set({ receivedAt: new Date(Date.now() - 2 * 3_600_000) });
    const added = await send(capture(links.bleachSpotify));
    expect(added.outcome.status).toBe("confirmed");
  });
});
