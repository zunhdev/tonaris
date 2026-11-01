import { describe, expect, test } from "bun:test";

import { brokenBody } from "../fixtures/broken-body";
import { clientParts, readBody } from "./client";
import { ProviderUnavailableError } from "./errors";
import { realClock } from "./paced-queue";
import { cachedValue, memoryCache } from "./provider-cache";
import { safeFetch } from "./safe-fetch";

const standIn = async () => new Response("stand-in");
const sleepNot = async () => {};

describe("clientParts", () => {
  test("safeFetch and the real clock, unless the options stand in for them", () => {
    expect(clientParts({})).toEqual({ fetch: safeFetch, clock: realClock });
    const { fetch, clock } = clientParts({ fetch: standIn, now: () => 7, sleep: sleepNot });
    expect(fetch).toBe(standIn);
    expect(clock.now()).toBe(7);
    expect(clock.sleep).toBe(sleepNot);
  });
});

describe("readBody", () => {
  test("the body as JSON or as text", async () => {
    expect(await readBody("musicbrainz", Response.json({ id: 1 }), "json")).toEqual({ id: 1 });
    expect(await readBody("qobuz", new Response("<html></html>"), "text")).toBe("<html></html>");
  });

  test("a body that breaks off, or isn't JSON, is the provider being unavailable", async () => {
    const broken = await readBody("spotify", brokenBody(), "json", "Get Album").catch(
      (caught: unknown) => caught,
    );
    expect(broken).toBeInstanceOf(ProviderUnavailableError);
    expect(broken).toMatchObject({
      provider: "spotify",
      message: "Couldn't read Spotify's answer to Get Album",
    });
    const text = await readBody("tidal", brokenBody(), "text").catch((caught: unknown) => caught);
    expect(text).toMatchObject({ provider: "tidal", message: "Couldn't read Tidal's answer" });
    const notJson = await readBody("youtube", new Response("<html>"), "json").catch(
      (caught: unknown) => caught,
    );
    expect(notJson).toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("cachedValue", () => {
  test("what one key keeps until it expires", async () => {
    const cache = memoryCache();
    await cache.set([{ key: "a", value: { kept: true } }], new Date(1_000));
    expect(await cachedValue(cache, "a", 999)).toEqual({ kept: true });
    expect(await cachedValue(cache, "a", 1_000)).toBeUndefined();
    expect(await cachedValue(cache, "b", 0)).toBeUndefined();
  });
});
