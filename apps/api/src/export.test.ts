// `GET /v1/export` (FR-08.1, FR-08.5, FR-08.6; TS-80): a session is required; the ZIP holds the four files, its JSON
// passes the schema with the collection in it, and its name is dated; five exports an hour, then `rate_limited`
// with Retry-After. Exporting writes nothing.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { strFromU8, unzipSync } from "fflate";

import {
  bootstrapSchema,
  exportSchema,
  mutationResultSchema,
  problemSchema,
  uuidv7,
  type Mutation,
} from "@tonaris/domain";

import { exportFileName } from "./routes/v1/export";
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

async function send(mutation: Omit<Mutation, "mutationId">) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie },
  });
  expect(mutationResultSchema.parse(await response.json()).outcome.status).toBe("confirmed");
}

const download = () => t.call("/v1/export", { headers: { cookie } });

/** Where the account's change log stands. */
async function seq() {
  const bootstrap = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
  return bootstrapSchema.parse(await bootstrap.json()).seq;
}

describe("GET /v1/export", () => {
  test("streams a ZIP of the data, its schema, the Markdown and the README", async () => {
    const list = uuidv7();
    const album = uuidv7();
    await send({
      name: "container.create",
      args: { id: list, kind: "list", parentId: null, name: "Jazz" },
    });
    await send({
      name: "album.create",
      args: {
        id: album,
        title: "Kind of Blue",
        artistCredit: "Miles Davis",
        releaseType: "album",
        isLive: false,
        originalYear: 1959,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    });
    await send({ name: "membership.add", args: { listId: list, albumId: album } });

    const before = await seq();
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="tonaris-export-\d{8}-\d{4}\.zip"$/,
    );
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toEqual([
      "tonaris-export.json",
      "tonaris-export.schema.json",
      "collection.md",
      "README.md",
    ]);
    const data = exportSchema.parse(JSON.parse(strFromU8(files["tonaris-export.json"]!)));
    expect(data.albums.map((each) => each.title)).toEqual(["Kind of Blue"]);
    expect(data.tree.containers).toMatchObject([{ name: "Jazz", albumIds: [album] }]);
    expect(JSON.parse(strFromU8(files["tonaris-export.schema.json"]!))).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Tonaris export",
    });
    expect(strFromU8(files["collection.md"]!)).toContain("## Jazz");
    expect(strFromU8(files["README.md"]!)).toStartWith("# Your Tonaris export");
    // Exporting writes nothing: the account's change log hasn't moved.
    expect(await seq()).toBe(before);
  });

  test("needs a session", async () => {
    const response = await t.call("/v1/export");
    expect(response.status).toBe(401);
  });

  test("five exports an hour, then rate_limited with Retry-After", async () => {
    for (let count = 0; count < 5; count += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one export after another, as a person would
      const response = await download();
      expect(response.status).toBe(200);
      // oxlint-disable-next-line no-await-in-loop
      await response.arrayBuffer();
    }
    const refused = await download();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(3000);
    expect(problemSchema.parse(await refused.json())).toMatchObject({
      code: "rate_limited",
      detail: "You've exported your data 5 times in the last hour. Try again in 60 minutes.",
    });
  });
});

describe("exportFileName", () => {
  test("dates the archive in UTC", () => {
    expect(exportFileName("2026-10-29T09:05:00.000Z")).toBe("tonaris-export-20261029-0905.zip");
  });
});
