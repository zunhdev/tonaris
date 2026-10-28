// Gzip for JSON responses (TS-120): the bootstrap, problem documents and handler results over 1 KB go out
// compressed to clients that take gzip, with their status and headers; small responses, clients without gzip and
// the event stream don't.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { gunzipSync } from "node:zlib";

import { bootstrapSchema, uuidv7, type Mutation } from "@tonaris/domain";

import { createTestApp, insertUser } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

const gzip = { "accept-encoding": "gzip, deflate, br" };

/** Saves enough albums for the bootstrap to pass the threshold. */
async function fillCollection(cookie: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const mutation: Mutation = {
      mutationId: uuidv7(),
      name: "album.create",
      args: {
        id: uuidv7(),
        title: `Album ${index}`,
        artistCredit: "Miles Davis",
        releaseType: "album",
        isLive: false,
        originalYear: 1959,
        recordingYearStart: null,
        recordingYearEnd: null,
        artworkUrl: null,
      },
    };
    // oxlint-disable-next-line no-await-in-loop
    await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
  }
}

describe("compression (TS-120)", () => {
  test("gzips the bootstrap for a client that takes gzip, and it decodes to the same snapshot", async () => {
    const anna = await t.signIn("anna@example.com");
    await fillCollection(anna.cookie);
    const plain = await t.call("/v1/sync/bootstrap", { headers: { cookie: anna.cookie } });
    const zipped = await t.call("/v1/sync/bootstrap", {
      headers: { cookie: anna.cookie, ...gzip },
    });

    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(zipped.status).toBe(200);
    expect(zipped.headers.get("content-encoding")).toBe("gzip");
    expect(zipped.headers.get("vary")?.toLowerCase()).toContain("accept-encoding");
    expect(zipped.headers.get("content-type")).toStartWith("application/json");
    // `app.handle` hands back the body as sent; a browser would decode it.
    const snapshot = JSON.parse(gunzipSync(await zipped.arrayBuffer()).toString("utf8"));
    expect(bootstrapSchema.parse(snapshot)).toEqual(bootstrapSchema.parse(await plain.json()));
    expect(snapshot.albums).toHaveLength(20);
  });

  test("leaves small responses, clients that refuse gzip, and the event stream alone", async () => {
    const anna = await t.signIn("anna@example.com");
    await fillCollection(anna.cookie);
    const small = await t.call("/v1/me", { headers: { cookie: anna.cookie, ...gzip } });
    const refused = await t.call("/v1/sync/bootstrap", {
      headers: { cookie: anna.cookie, "accept-encoding": "gzip;q=0, identity" },
    });
    expect(small.headers.get("content-encoding")).toBeNull();
    expect(await small.json()).toMatchObject({ email: "anna@example.com" });
    expect(refused.headers.get("content-encoding")).toBeNull();

    const base = t.listen();
    const controller = new AbortController();
    const stream = await fetch(`${base}/v1/sync/stream`, {
      headers: { cookie: anna.cookie, ...gzip },
      signal: controller.signal,
      decompress: false,
    });
    expect(stream.headers.get("content-type")).toStartWith("text/event-stream");
    expect(stream.headers.get("content-encoding")).toBeNull();
    const reader = stream.body?.getReader();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toStartWith(": open");
    controller.abort();
  });

  test("gzips a large problem document and keeps its status and headers", async () => {
    const anna = await t.signIn("anna@example.com");
    const badItems = Array.from({ length: 60 }, () => ({ mutationId: "not-a-uuid" }));
    const response = await t.call("/v1/batches", {
      json: { batchId: uuidv7(), items: badItems },
      headers: { cookie: anna.cookie, ...gzip },
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toStartWith("application/problem+json");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("access-control-allow-origin")).toBe(t.config.webOrigin);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const problem = JSON.parse(gunzipSync(await response.arrayBuffer()).toString("utf8"));
    expect(problem).toMatchObject({ code: "validation_failed", status: 422 });
  });

  test("keeps a small answer's cookies, as signing in sets them", async () => {
    await insertUser(t.db, "anna@example.com");
    const arrived = t.email.next("anna@example.com");
    await t.call("/auth/email-otp/send-verification-otp", {
      json: { email: "anna@example.com", type: "sign-in" },
    });
    const sent = await arrived;
    if (!("code" in sent.data)) throw new Error(`Expected a code, got ${sent.template}`);
    const response = await t.call("/auth/sign-in/email-otp", {
      json: { email: "anna@example.com", otp: sent.data.code },
      headers: gzip,
    });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    expect((await t.call("/v1/me", { headers: { cookie } })).status).toBe(200);
  });
});
