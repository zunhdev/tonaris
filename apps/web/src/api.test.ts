import { expect, test } from "bun:test";

import { createApiClient, refusalOf } from "./api";

test("the Eden client calls /v1 on the API origin with the session cookie and types the result", async () => {
  const requested: string[] = [];
  const credentials: (RequestCredentials | undefined)[] = [];
  const fetcher: typeof fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      requested.push(input instanceof Request ? input.url : String(input));
      credentials.push(input instanceof Request ? input.credentials : init?.credentials);
      return Promise.resolve(Response.json({ status: "ok" }));
    },
    { preconnect: fetch.preconnect },
  );
  const api = createApiClient("http://api.test", { fetcher });

  const { data } = await api.v1.health.get();

  // `data` is typed from the API's routes: `{ status: "ok" } | null`.
  expect(data?.status).toBe("ok");
  expect(requested).toEqual(["http://api.test/v1/health"]);
  expect(credentials).toEqual(["include"]);
});

test("the Eden client types a route's error statuses as problems", async () => {
  const problem = {
    type: "about:blank",
    title: "Unauthorized",
    status: 401,
    code: "unauthenticated",
    instance: "/v1/me",
  };
  const fetcher: typeof fetch = Object.assign(
    () =>
      Promise.resolve(
        Response.json(problem, {
          status: 401,
          headers: { "content-type": "application/problem+json" },
        }),
      ),
    { preconnect: fetch.preconnect },
  );
  const api = createApiClient("http://api.test", { fetcher });

  const { data, error } = await api.v1.me.get();

  expect(data).toBeNull();
  // `error` is typed by status from the route's `response` map: a 401 carries the Problem schema.
  if (error?.status !== 401) throw new Error(`expected a 401, got ${error?.status}`);
  const code: string = error.value.code;
  expect(code).toBe("unauthenticated");
  expect(error.value.instance).toBe("/v1/me");
});

test("a refusal says its problem's detail, or the page's fallback", () => {
  const problem = { type: "about:blank", title: "Gone", status: 410, code: "expired" };
  expect(refusalOf({ value: { ...problem, detail: "This link has expired." } }, "Try again.")).toBe(
    "This link has expired.",
  );
  expect(refusalOf({ value: problem }, "Try again.")).toBe("Try again.");
  expect(refusalOf({ value: "Bad Gateway" }, "Try again.")).toBe("Try again.");
  expect(refusalOf(null, "Try again.")).toBeUndefined();
});
