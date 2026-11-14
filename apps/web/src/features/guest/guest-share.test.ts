// A guest page's reads (DRIFT-106): only a 404 means the link stopped working; a 429 or a failure waits and tries
// again, after the API's Retry-After when it gave one.

import { describe, expect, test } from "bun:test";

import type { SharedSnapshot } from "@tonaris/domain";

import { loadGuestShare, retryAfterMs } from "./guest-share";

const answer =
  (status: number, headers: Record<string, string> = {}) =>
  () =>
    Promise.resolve({
      data: null,
      error: { status },
      response: new Response(null, { status, headers }),
    });

describe("loadGuestShare", () => {
  test("a share read is shown", async () => {
    const snapshot: SharedSnapshot = {
      rootId: "x",
      role: "view",
      seq: 1,
      owner: { displayName: null },
      containers: [],
      albums: [],
      memberships: [],
      links: [],
      fields: [],
      fieldValues: [],
    };
    expect(await loadGuestShare(() => Promise.resolve({ data: snapshot, error: null }))).toEqual({
      snapshot,
    });
  });

  test("only a 404 means the link stopped working", async () => {
    expect(await loadGuestShare(answer(404))).toEqual({ snapshot: undefined, gone: true });
    expect(await loadGuestShare(answer(500))).toEqual({
      snapshot: undefined,
      gone: false,
      retryAfterMs: 5_000,
    });
    expect(await loadGuestShare(() => Promise.reject(new Error("offline")))).toMatchObject({
      gone: false,
    });
  });

  test("a 429 tries again after its Retry-After", async () => {
    expect(await loadGuestShare(answer(429, { "retry-after": "12" }))).toEqual({
      snapshot: undefined,
      gone: false,
      retryAfterMs: 12_000,
    });
  });
});

describe("retryAfterMs", () => {
  test("reads seconds, with a pause when there are none and a cap of a minute", () => {
    expect(retryAfterMs("3")).toBe(3_000);
    expect(retryAfterMs(null)).toBe(5_000);
    expect(retryAfterMs("soon")).toBe(5_000);
    expect(retryAfterMs("600")).toBe(60_000);
  });
});
