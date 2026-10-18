import { describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { z } from "zod";

import { createApp } from "./app";
import { generatedDocument } from "./generate-openapi";
import { committedDocumentPath } from "./openapi";

const app = createApp();
const api = treaty(app);

describe("/v1/health", () => {
  test("answers ok, typed for Eden", async () => {
    const { data, error, status } = await api.v1.health.get();
    expect(status).toBe(200);
    expect(error).toBeNull();
    // `data` is typed `{ status: "ok" } | null`; a wrong field here fails `tsc`.
    expect(data?.status).toBe("ok");
  });
});

describe("/healthz", () => {
  test("answers the host's health check outside /v1", async () => {
    const response = await app.handle("/healthz");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});

describe("unknown routes", () => {
  test("answer a not_found problem", async () => {
    const response = await app.handle("/v1/nothing-here");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "not_found",
      instance: "/v1/nothing-here",
      detail: "There is nothing at this path.",
    });
  });
});

describe("OpenAPI", () => {
  test("serves the /v1 document at /v1/openapi.json", async () => {
    const response = await app.handle("/v1/openapi.json");
    expect(response.status).toBe(200);
    const document = z
      .object({ openapi: z.string(), paths: z.record(z.string(), z.unknown()) })
      .parse(await response.json());
    expect(document.openapi).toBe("3.1.2");
    // Only the versioned contract: no /healthz and no openapi.json itself.
    expect(Object.keys(document.paths)).toEqual(["/v1/health"]);
    expect(document.paths["/v1/health"]).toMatchObject({
      get: { responses: { default: { content: { "application/problem+json": {} } } } },
    });
  });

  test("the served document is the generated one", async () => {
    const served = await (await app.handle("/v1/openapi.json")).json();
    expect(served).toEqual(JSON.parse(generatedDocument()));
  });

  test("the committed document is up to date (bun run openapi:generate)", async () => {
    expect(await Bun.file(committedDocumentPath).text()).toBe(generatedDocument());
  });
});
