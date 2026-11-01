// What a sharing write makes of the API's answer (TS-22): an outcome, a judged refusal as a failed outcome with the
// server's reason, and no answer, which is sent once more with the same mutationId before giving up.

import { describe, expect, test } from "bun:test";

import { createApiClient } from "@/api";

import { failure } from "@tonaris/domain";

import { failureOf, sendNow, type Unsent } from "./send";

const mutation: Unsent = { name: "share.saveLink", args: { token: "t".repeat(43) } };

/** A client whose requests `answers` answer in turn, recording each mutationId sent. */
function answering(...answers: (() => Response | Promise<Response>)[]) {
  const ids: unknown[] = [];
  const fetcher: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const body: unknown = await new Request(input, init).json();
      ids.push(
        typeof body === "object" && body !== null && "mutationId" in body && body.mutationId,
      );
      const next = answers[ids.length - 1];
      if (!next) throw new Error("No answer left.");
      return next();
    },
    { preconnect: fetch.preconnect },
  );
  return { ids, client: createApiClient("http://api.test", { fetcher }) };
}

const problem = (code: Parameters<typeof failure>[0], detail: string) => {
  const { problem: body } = failure(code, detail);
  return () =>
    Response.json(body, {
      status: body.status,
      headers: { "content-type": "application/problem+json" },
    });
};

const confirmed = () =>
  Response.json({ mutationId: "m", outcome: { status: "confirmed", changes: [] } });
const down = () => Promise.reject(new TypeError("Failed to fetch"));

describe("sendNow (TS-22)", () => {
  test("an answer's outcome comes back, sent once", async () => {
    const { ids, client } = answering(confirmed);
    expect(await sendNow(mutation, { client })).toMatchObject({ status: "confirmed" });
    expect(ids).toHaveLength(1);
  });

  test("a refusal with a problem was judged: it fails with the server's reason, sent once", async () => {
    const { ids, client } = answering(
      problem("validation_failed", "That link no longer works."),
      confirmed,
    );
    const outcome = await sendNow(mutation, { client });
    expect(outcome).toMatchObject({ status: "failed", code: "validation_failed" });
    expect(failureOf(outcome)).toBe("That link no longer works.");
    expect(ids).toHaveLength(1);
  });

  test("no answer, a 5xx, a 408 or a 429 is sent once more with the same mutationId", async () => {
    const firsts = [
      down,
      problem("internal_error", "Something went wrong."),
      () => new Response("", { status: 408 }),
      problem("rate_limited", "Slow down."),
    ];
    const sent = await Promise.all(
      firsts.map(async (first) => {
        const { ids, client } = answering(first, confirmed);
        return { outcome: await sendNow(mutation, { client }), ids };
      }),
    );
    for (const { outcome, ids } of sent) {
      expect(outcome).toMatchObject({ status: "confirmed" });
      expect(ids).toHaveLength(2);
      expect(ids[1]).toBe(ids[0]);
    }
  });

  test("no answer twice throws", async () => {
    const { ids, client } = answering(down, down);
    expect(await sendNow(mutation, { client }).catch((error: unknown) => error)).toEqual(
      new Error("No answer from Tonaris."),
    );
    expect(ids).toHaveLength(2);
  });
});
