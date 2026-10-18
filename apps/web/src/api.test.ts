import { expect, test } from "bun:test";

import { createApiClient } from "./api";

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
