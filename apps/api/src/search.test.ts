// `GET /v1/search` (FR-12.1, FR-12.4, FR-12.5, X-02; TS-50): the signed-in account's own active content, grouped,
// ordered as the app orders it and located, with each group's total; a session is required and the query checked.

import { afterEach, beforeEach, expect, test } from "bun:test";

import { mutationResultSchema, searchResultsSchema, uuidv7, type Mutation } from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

async function send(mutation: Omit<Mutation, "mutationId">, as = cookie) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  expect(response.status).toBe(200);
  expect(mutationResultSchema.parse(await response.json()).outcome.status).toBe("confirmed");
}

const container = (kind: "folder" | "list", name: string, parentId: string | null = null) => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
});

const album = (title: string, artistCredit: string) => ({
  id: uuidv7(),
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
});

const search = (query: string, as = cookie) =>
  t.call(`/v1/search?${query}`, { headers: { cookie: as } });

test("finds folders, lists and albums, grouped, ordered and located", async () => {
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  const classic = container("list", "Classic Doom");
  await send({ name: "container.create", args: metal });
  await send({ name: "container.create", args: doom });
  await send({ name: "container.create", args: classic });
  const epicus = album("Epicus Doomicus Metallicus", "Candlemass");
  await send({ name: "album.create", args: epicus });
  await send({ name: "membership.add", args: { listId: doom.id, albumId: epicus.id } });
  const homogenic = album("Homogenic", "Björk");
  await send({ name: "album.create", args: homogenic });

  const response = await search("q=doom");
  expect(response.status).toBe(200);
  const found = searchResultsSchema.parse(await response.json());
  expect(found.lists).toEqual({
    total: 2,
    items: [
      { id: doom.id, kind: "list", name: "Doom", parentId: metal.id, location: ["Metal"] },
      { id: classic.id, kind: "list", name: "Classic Doom", parentId: null, location: [] },
    ],
  });
  expect(found.albums.items).toEqual([
    { ...epicus, lists: [{ id: doom.id, location: ["Metal", "Doom"] }] },
  ]);

  const accented = searchResultsSchema.parse(await (await search("q=bjork")).json());
  expect(accented.albums.items.map(({ artistCredit, lists }) => ({ artistCredit, lists }))).toEqual(
    [{ artistCredit: "Björk", lists: [] }],
  );

  // The limit applies per group; the total stays.
  const limited = searchResultsSchema.parse(await (await search("q=doom&limit=1")).json());
  expect(limited.lists.total).toBe(2);
  expect(limited.lists.items.map(({ name }) => name)).toEqual(["Doom"]);
});

test("another account's content isn't searched", async () => {
  const { cookie: ben } = await t.signIn("ben@example.com");
  await send({ name: "container.create", args: container("list", "Doom") }, ben);
  const found = searchResultsSchema.parse(await (await search("q=doom")).json());
  expect(found.lists.total).toBe(0);
});

test("a session is required, and the query checked", async () => {
  const signedOut = await t.call("/v1/search?q=doom");
  expect(signedOut.status).toBe(401);
  const queries = ["q=", "q=%20%20", "q=doom&limit=0", "q=doom&limit=101", ""];
  const statuses = await Promise.all(queries.map(async (query) => (await search(query)).status));
  expect(statuses).toEqual(queries.map(() => 422));
});
