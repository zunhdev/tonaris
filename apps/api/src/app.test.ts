import { describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { z } from "zod";

import { createDatabase } from "@tonaris/db";

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { apiConfig } from "./config";
import { generatedDocument } from "./generate-openapi";
import { committedDocumentPath } from "./openapi";

// These routes never reach the database or send email, so the pool never connects. Better Auth writes at
// start-up, so it keeps its rows in memory.
const config = apiConfig({});
const db = createDatabase();
const email = { send: () => Promise.resolve() };
const auth = createAuth({ config, db: "in-memory", email });
const app = createApp({ config, auth, db, email });
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
    // Only the versioned contract: no /healthz, /auth/* or openapi.json itself.
    expect(Object.keys(document.paths)).toEqual([
      "/v1/health",
      "/v1/me",
      "/v1/connections",
      "/v1/connections/{id}",
      "/v1/approvals/{id}",
      "/v1/approvals/{id}/decision",
      "/v1/mutations",
      "/v1/batches",
      "/v1/mutations/{id}",
      "/v1/sync/bootstrap",
      "/v1/sync/stream",
    ]);
    expect(document.paths["/v1/health"]).toMatchObject({
      get: { responses: { default: { content: { "application/problem+json": {} } } } },
    });
    // A declared error status is the shared Problem component, as problem+json.
    expect(document.paths["/v1/me"]).toMatchObject({
      get: {
        responses: {
          401: {
            content: {
              "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
            },
          },
        },
      },
    });
  });

  test("keeps null in a nullable enum", async () => {
    const served: unknown = await (await app.handle("/v1/openapi.json")).json();
    const { paths } = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(served);
    const releaseType = z
      .object({
        requestBody: z.object({
          content: z.object({
            "application/json": z.object({
              schema: z.object({
                oneOf: z.array(
                  z.object({
                    properties: z.object({
                      args: z.object({ properties: z.record(z.string(), z.unknown()) }),
                    }),
                  }),
                ),
              }),
            }),
          }),
        }),
      })
      .parse(paths["/v1/mutations"]?.post).requestBody.content["application/json"].schema.oneOf[0]
      ?.properties.args.properties.releaseType;
    expect(releaseType).toEqual({
      type: ["string", "null"],
      enum: ["album", "ep", "compilation", null],
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
