import { describe, expect, test } from "bun:test";

import { clientParts } from "./client";
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

describe("cachedValue", () => {
  test("what one key keeps until it expires", async () => {
    const cache = memoryCache();
    await cache.set([{ key: "a", value: { kept: true } }], new Date(1_000));
    expect(await cachedValue(cache, "a", 999)).toEqual({ kept: true });
    expect(await cachedValue(cache, "a", 1_000)).toBeUndefined();
    expect(await cachedValue(cache, "b", 0)).toBeUndefined();
  });
});
