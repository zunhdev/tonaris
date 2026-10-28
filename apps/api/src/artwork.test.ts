// Artwork through the image proxy (TS-103; FR-03.4, Q-05): albums the API sends carry their artwork's signature, and
// `/img/{signature}/{url}` serves only what the server signed, raster images only, cached for good; anything else is a
// 404 the client answers with its fallback tile. The artwork's host is stubbed.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { readChanges } from "@tonaris/db";
import {
  artworkPath,
  bootstrapSchema,
  mutationResultSchema,
  uuidv7,
  type Album,
  type Mutation,
} from "@tonaris/domain";
import { SafeFetchError, type SafeFetchInit } from "@tonaris/providers";

import { artworkSigner, presentChange, type ImageFetch } from "./artwork";
import { createTestApp } from "./testing";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const cover = "https://images.example/covers/bleach.png";
const vector = "https://images.example/covers/bleach.svg";
const missing = "https://images.example/covers/missing.png";
const blocked = "https://intranet.example/cover.png";

const fetched: { url: string; init: SafeFetchInit }[] = [];
const imageFetch: ImageFetch = (url, init) => {
  fetched.push({ url, init });
  if (url === cover) {
    return Promise.resolve(new Response(png, { headers: { "content-type": "image/png" } }));
  }
  if (url === vector) {
    return Promise.resolve(
      new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    );
  }
  if (url === blocked) return Promise.reject(new SafeFetchError("address", "a private address"));
  return Promise.resolve(new Response(null, { status: 404 }));
};

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;
let accountId: string;

beforeEach(async () => {
  fetched.length = 0;
  t = await createTestApp({ imageFetch });
  ({ id: accountId, cookie } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

const signer = () => artworkSigner(t.config.authSecret);

const album = (artworkUrl: string | null): Album => ({
  id: uuidv7(),
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album",
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl,
});

/** Creates the album, then sets its artwork, as the web app does (TON-48). */
async function saved(record: Album) {
  const { artworkUrl, ...args } = record;
  expect((await send({ mutationId: uuidv7(), name: "album.create", args })).status).toBe(
    "confirmed",
  );
  if (artworkUrl === null) return;
  const outcome = await send({
    mutationId: uuidv7(),
    name: "album.setArtwork",
    args: { id: record.id, artworkUrl },
    base: { artworkUrl: null },
  });
  expect(outcome.status).toBe("confirmed");
}

async function send(mutation: Mutation) {
  const response = await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json()).outcome;
}

describe("artwork signatures (TS-103)", () => {
  test("a signature is the server's alone, and names one URL", () => {
    const { sign, verify } = signer();
    const signature = sign(cover);
    expect(signature).toHaveLength(22);
    expect(verify(signature, cover)).toBe(true);
    expect(verify(signature, missing)).toBe(false);
    expect(verify(signature, cover)).toBe(true);
    expect(artworkSigner("another secret").verify(signature, cover)).toBe(false);
  });

  test("the bootstrap and the stream send albums with their artwork signed", async () => {
    const record = album(cover);
    await saved(record);
    const response = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
    const [sent] = bootstrapSchema.parse(await response.json()).albums;
    expect(sent).toEqual({ ...record, artworkSignature: signer().sign(cover) });

    const [, change] = await readChanges(t.db, accountId, 0, 10);
    expect(change && presentChange(signer(), change)).toMatchObject({
      data: { artworkSignature: signer().sign(cover) },
    });
    // An album without artwork has no signature.
    const plain = { ...record, id: uuidv7(), artworkUrl: null };
    await saved(plain);
    const again = bootstrapSchema.parse(
      await (await t.call("/v1/sync/bootstrap", { headers: { cookie } })).json(),
    );
    expect(again.albums.find((each) => each.id === plain.id)).toEqual(plain);
  });

  test("an artwork URL must be an https link", async () => {
    const record = album(null);
    await saved(record);
    const outcome = await send({
      mutationId: uuidv7(),
      name: "album.setArtwork",
      args: { id: record.id, artworkUrl: "http://images.example/cover.png" },
      base: { artworkUrl: null },
    });
    expect(outcome).toMatchObject({ status: "failed", code: "validation_failed" });
  });
});

describe("the image proxy (TS-103)", () => {
  test("serves a signed image, cached for good, fetched as a raster image only", async () => {
    const response = await t.call(artworkPath(cover, signer().sign(cover)));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=604800, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(fetched[0]?.init.contentTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ]);
  });

  test("anything the server didn't sign is never fetched", async () => {
    const forged = artworkPath(blocked, signer().sign(cover));
    expect((await t.call(forged)).status).toBe(404);
    expect((await t.call("/img/abc/!!!")).status).toBe(404);
    expect(fetched).toEqual([]);
  });

  test("an SVG, a missing image and a refused host are 404s", async () => {
    for (const url of [vector, missing, blocked]) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await t.call(artworkPath(url, signer().sign(url)));
      expect(response.status).toBe(404);
    }
    expect(fetched.map((each) => each.url)).toEqual([vector, missing, blocked]);
  });
});
