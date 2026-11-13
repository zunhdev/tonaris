// The request limits beyond sign-in, captures and exports (TS-104, decided 13 November 2026; DRIFT-007): token
// buckets on a test clock, then through the API, where a request over its limit answers 429 with `Retry-After` and
// does nothing.

import { afterEach, describe, expect, test } from "bun:test";

import {
  bootstrapSchema,
  mutationResultSchema,
  shareSettingsSchema,
  uuidv7,
} from "@tonaris/domain";

import { ProblemError } from "./problem";
import { createRequestLimiter, requestLimits } from "./request-limits";
import { createTestApp } from "./testing";
import { TokenBuckets } from "./token-buckets";

describe("token buckets", () => {
  test("pass a burst of the capacity, then refill evenly, and a refusal takes nothing", () => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 3, refillMs: 3_000 }, () => now);
    for (let n = 0; n < 3; n++) expect(buckets.take("a")).toBeUndefined();
    expect(buckets.take("a")).toBe(1_000);
    expect(buckets.take("a")).toBe(1_000);
    // Other keys have buckets of their own.
    expect(buckets.take("b")).toBeUndefined();
    now += 1_000;
    expect(buckets.take("a")).toBeUndefined();
    expect(buckets.take("a")).toBe(1_000);
    now += 60_000;
    for (let n = 0; n < 3; n++) expect(buckets.take("a")).toBeUndefined();
  });
});

/** The problem `run` throws, if it throws one. */
function refusal(run: () => void): ProblemError | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof ProblemError) return error;
    throw error;
  }
  return undefined;
}

describe("the limiter (TS-104)", () => {
  test("allows an account 30 mutation requests at once, then 30 a second", () => {
    let now = 0;
    const limiter = createRequestLimiter(requestLimits, () => now);
    for (let n = 0; n < requestLimits.mutations.capacity; n++) limiter.mutation("anna");
    const refused = refusal(() => limiter.mutation("anna"));
    expect(refused).toMatchObject({ status: 429, code: "rate_limited" });
    expect(refused?.headers).toEqual({ "retry-after": "1" });
    expect(refusal(() => limiter.mutation("ben"))).toBeUndefined();
    now += 100;
    for (let n = 0; n < 3; n++) limiter.mutation("anna");
    expect(refusal(() => limiter.mutation("anna"))).toBeDefined();
  });

  test("allows an address 120 guest views a minute; a view without an address isn't counted", () => {
    let now = 0;
    const limiter = createRequestLimiter(requestLimits, () => now);
    for (let n = 0; n < requestLimits.guestViews.capacity; n++) limiter.guestView("203.0.113.7");
    expect(refusal(() => limiter.guestView("203.0.113.7"))?.headers).toEqual({
      "retry-after": "1",
    });
    expect(refusal(() => limiter.guestView("198.51.100.1"))).toBeUndefined();
    for (let n = 0; n < 500; n++) limiter.guestView(undefined);
    now += 30_000;
    for (let n = 0; n < 60; n++) limiter.guestView("203.0.113.7");
    expect(refusal(() => limiter.guestView("203.0.113.7"))).toBeDefined();
  });
});

describe("through the API", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  afterEach(async () => {
    await t.drop();
  });

  test("a mutation request over the limit is refused with Retry-After and runs nothing", async () => {
    let now = 0;
    t = await createTestApp({ requestLimiter: createRequestLimiter(requestLimits, () => now) });
    const { cookie } = await t.signIn("anna@example.com");
    const create = (name: string) =>
      t.call("/v1/mutations", {
        json: {
          mutationId: uuidv7(),
          name: "container.create",
          args: { id: uuidv7(), kind: "list", parentId: null, name },
        },
        headers: { cookie },
      });
    for (let n = 0; n < requestLimits.mutations.capacity - 1; n++) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await create(`List ${n}`)).status).toBe(200);
    }
    // A batch counts once, like a mutation.
    const batch = await t.call("/v1/batches", {
      json: {
        batchId: uuidv7(),
        items: [
          {
            mutationId: uuidv7(),
            name: "container.create",
            args: { id: uuidv7(), kind: "list", parentId: null, name: "Batched" },
          },
        ],
      },
      headers: { cookie },
    });
    expect(batch.status).toBe(200);

    const refused = await create("One too many");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("1");
    expect(await refused.json()).toMatchObject({ code: "rate_limited" });
    const bootstrap = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
    const { containers } = bootstrapSchema.parse(await bootstrap.json());
    expect(containers.map(({ name }) => name)).not.toContain("One too many");

    now += 1_000;
    const later = await create("Later");
    expect(mutationResultSchema.parse(await later.json()).outcome.status).toBe("confirmed");
  });

  test("guests' views over the limit are refused per address, before the link is looked up", async () => {
    let now = 0;
    t = await createTestApp({ requestLimiter: createRequestLimiter(requestLimits, () => now) });
    const { cookie } = await t.signIn("denis@example.com");
    const send = (mutation: Record<string, unknown>) =>
      t.call("/v1/mutations", { json: { mutationId: uuidv7(), ...mutation }, headers: { cookie } });
    await send({ name: "account.setDisplayName", args: { displayName: "Denis" } });
    const doom = uuidv7();
    await send({
      name: "container.create",
      args: { id: doom, kind: "list", parentId: null, name: "Doom" },
    });
    await send({
      name: "share.setLink",
      args: { containerId: doom, linkId: uuidv7(), enabled: true },
    });
    const settings = shareSettingsSchema.parse(
      await (await t.call(`/v1/containers/${doom}/sharing`, { headers: { cookie } })).json(),
    );
    const token = settings.link?.url.split("/s/")[1] ?? "";
    // Tests name the client's address in X-Forwarded-For, as the host's proxy would (testing.ts).
    const view = (path: string, address: string) =>
      t.call(path, { headers: { "x-forwarded-for": address } });

    for (let n = 0; n < requestLimits.guestViews.capacity - 1; n++) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await view(`/v1/s/${token}`, "203.0.113.7")).status).toBe(200);
    }
    // An unknown token counts too, so guessing tokens is slowed as well.
    expect((await view(`/v1/s/${"x".repeat(43)}`, "203.0.113.7")).status).toBe(404);
    const refused = await view(`/v1/s/${token}`, "203.0.113.7");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("1");
    expect((await view(`/v1/s/${token}/stream`, "203.0.113.7")).status).toBe(429);
    expect((await view(`/v1/s/${token}`, "198.51.100.1")).status).toBe(200);

    now += 1_000;
    expect((await view(`/v1/s/${token}`, "203.0.113.7")).status).toBe(200);
  });
});
