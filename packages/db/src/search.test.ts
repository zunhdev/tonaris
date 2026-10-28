// Server search (FR-12.1, FR-12.4, FR-12.5, X-02; TS-12, TS-50): the parity fixtures the web app runs too, the
// owner's scope, LIKE's wildcards taken as text, the key fill-in, and the trigram indexes.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import {
  defaultSearchLimit,
  nameKey,
  searchKey,
  trashRetentionDays,
  uuidv7,
} from "@tonaris/domain";
import normalize from "@tonaris/domain/fixtures/normalize.json";
import parity from "@tonaris/domain/fixtures/search.json";

import { fillSearchKeys } from "./migrations";
import { albums, containers, memberships, trashUnits, users } from "./schema";
import { searchCollection } from "./search";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newOwner(): Promise<string> {
  const id = uuidv7();
  await t.db.insert(users).values({ id, email: `${id}@example.com` });
  return id;
}

/** A unit in Trash holding just `rootId`, for content the fixture has in Trash. */
async function trashUnit(ownerId: string, kind: "list" | "album", rootId: string) {
  const id = uuidv7();
  const deletedAt = new Date();
  await t.db.insert(trashUnits).values({
    id,
    ownerId,
    kind,
    rootId,
    deletedAt,
    expiresAt: new Date(deletedAt.getTime() + trashRetentionDays * 86_400_000),
  });
  return { trashedAt: deletedAt, trashUnitId: id };
}

async function insertContainer(
  ownerId: string,
  values: { id?: string; kind: "folder" | "list"; name: string; parentId?: string | null },
) {
  const id = values.id ?? uuidv7();
  await t.db.insert(containers).values({
    id,
    ownerId,
    kind: values.kind,
    parentId: values.parentId ?? null,
    name: values.name,
    nameKey: nameKey(values.name),
    searchNameKey: searchKey(values.name),
  });
  return id;
}

const albumRow = (ownerId: string, title: string, artistCredit: string, id = uuidv7()) => ({
  id,
  ownerId,
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1990,
  searchTitleKey: searchKey(title),
  searchArtistKey: searchKey(artistCredit),
});

async function insertAlbum(ownerId: string, title: string, artistCredit: string) {
  const row = albumRow(ownerId, title, artistCredit);
  await t.db.insert(albums).values(row);
  return row.id;
}

describe("the parity fixture (X-02, TS-50)", () => {
  let ownerId: string;
  const ids = new Map<string, string>();
  const idOf = (ref: string) => {
    let id = ids.get(ref);
    if (!id) {
      id = uuidv7();
      ids.set(ref, id);
    }
    return id;
  };

  beforeEach(async () => {
    ownerId = await newOwner();
    // The fixture's Trash: one unit per trashed list or album.
    const trashed = async (kind: "list" | "album", ref: string, inTrash: boolean | undefined) =>
      inTrash === true ? trashUnit(ownerId, kind, idOf(ref)) : {};
    const containerRows = await Promise.all(
      parity.containers.map(async (each) => ({
        id: idOf(each.ref),
        ownerId,
        kind: each.kind === "folder" ? ("folder" as const) : ("list" as const),
        parentId: each.parent === null ? null : idOf(each.parent),
        name: each.name,
        nameKey: nameKey(each.name),
        searchNameKey: searchKey(each.name),
        description: "description" in each ? each.description : null,
        ...(await trashed("list", each.ref, each.trashed)),
      })),
    );
    // No foreign key on parents (TS-11), so one insert takes them in any order.
    await t.db.insert(containers).values(containerRows);
    const albumRows = await Promise.all(
      parity.albums.map(async (each) => ({
        ...albumRow(ownerId, each.title, each.artist, idOf(each.ref)),
        ...(await trashed("album", each.ref, each.trashed)),
      })),
    );
    await t.db.insert(albums).values(albumRows);
    await t.db
      .insert(memberships)
      .values(
        parity.albums.flatMap((each) =>
          each.lists.map((list) => ({ listId: idOf(list), albumId: idOf(each.ref), ownerId })),
        ),
      );
  });

  test.each(parity.queries)('"$query"', async (expected) => {
    const found = await searchCollection(t.db, {
      ownerId,
      query: expected.query,
      limit: expected.limit ?? defaultSearchLimit,
    });
    for (const group of ["folders", "lists"] as const) {
      expect(found[group].total).toBe(expected[group].total);
      expect(found[group].items.map(({ name, location }) => ({ name, location }))).toEqual(
        expected[group].items,
      );
    }
    expect(found.albums.total).toBe(expected.albums.total);
    expect(
      found.albums.items.map(({ title, lists }) => ({
        title,
        lists: lists.map(({ location }) => location),
      })),
    ).toEqual(expected.albums.items);
  });
});

test("normalize.json's search cases match on the server as in the domain (TS-12)", async () => {
  const ownerId = await newOwner();
  const rows = [...new Set(normalize.search.map(({ text }) => text))].map((text) =>
    albumRow(ownerId, text, "Someone"),
  );
  await t.db.insert(albums).values(rows);
  const byText = new Map(rows.map(({ id, title }) => [title, id]));
  const answers = await Promise.all(
    normalize.search.map(async ({ query, text }) => {
      const found = await searchCollection(t.db, { ownerId, query, limit: 100 });
      return { query, text, matches: found.albums.items.some(({ id }) => id === byText.get(text)) };
    }),
  );
  expect(answers).toEqual(normalize.search);
});

test("only the owner's content, with % and _ as text", async () => {
  const anna = await newOwner();
  const ben = await newOwner();
  await insertContainer(anna, { kind: "list", name: "Doom" });
  await insertContainer(ben, { kind: "list", name: "Doom 2" });
  await insertAlbum(ben, "Doom", "Ben's band");
  const found = await searchCollection(t.db, { ownerId: anna, query: "doom", limit: 10 });
  expect(found.lists.items.map(({ name }) => name)).toEqual(["Doom"]);
  expect(found.albums.total).toBe(0);

  await insertAlbum(anna, "100% Hits", "Various");
  await insertAlbum(anna, "1000 Hits", "Various");
  await insertAlbum(anna, "snake_case", "Various");
  const percent = await searchCollection(t.db, { ownerId: anna, query: "100%", limit: 10 });
  expect(percent.albums.items.map(({ title }) => title)).toEqual(["100% Hits"]);
  const underscore = await searchCollection(t.db, { ownerId: anna, query: "e_c", limit: 10 });
  expect(underscore.albums.items.map(({ title }) => title)).toEqual(["snake_case"]);
  const blank = await searchCollection(t.db, { ownerId: anna, query: "  ", limit: 10 });
  expect(blank.albums.total + blank.lists.total + blank.folders.total).toBe(0);
});

test("the migrate command fills in container keys the migration left empty (TS-12)", async () => {
  const ownerId = await newOwner();
  const id = await insertContainer(ownerId, { kind: "list", name: "Björk Favorites" });
  await t.db.update(containers).set({ searchNameKey: "" }).where(eq(containers.id, id));
  expect(await fillSearchKeys(t.db)).toBe(1);
  const [row] = await t.db.select().from(containers).where(eq(containers.id, id));
  expect(row?.searchNameKey).toBe("bjork favorites");
  expect(await fillSearchKeys(t.db)).toBe(0);
});

test("substring matches can use the trigram indexes (TS-50)", async () => {
  const plans = await t.db.transaction(async (tx) => {
    // Too few rows for the planner to choose an index by itself.
    await tx.execute(sql`set local enable_seqscan = off`);
    const explain = async (column: string, table: string) => {
      const rows = await tx.execute<{ "QUERY PLAN": string }>(
        sql.raw(`explain select id from ${table} where ${column} like '%doom%'`),
      );
      return rows.map((row) => row["QUERY PLAN"]).join("\n");
    };
    return Promise.all([
      explain("search_title_key", "albums"),
      explain("search_artist_key", "albums"),
      explain("search_name_key", "containers"),
    ]);
  });
  expect(plans[0]).toContain("albums_search_title_key_trgm");
  expect(plans[1]).toContain("albums_search_artist_key_trgm");
  expect(plans[2]).toContain("containers_search_name_key_trgm");
});
