import { describe, expect, mock, test } from "bun:test";

import { Elysia } from "elysia";
import { z } from "zod";

import { problemSchema } from "@tonaris/domain";

import { problemDetails } from "./problem";

function testApp() {
  const logError = mock((_error: unknown, _path: string) => {});
  const app = new Elysia()
    .use(problemDetails({ logError }))
    .get(
      "/albums",
      {
        query: z.object({ limit: z.coerce.number().int().positive() }),
        response: { 200: z.object({ limit: z.number() }), 422: problemSchema },
      },
      ({ query }) => ({ limit: query.limit }),
    )
    .post(
      "/albums",
      { body: z.object({ title: z.string().min(1), tags: z.array(z.string()) }) },
      () => "created",
    )
    .get("/boom", () => {
      throw new Error("connection string postgres://secret@db");
    })
    // Well typed, but the value breaks the response schema at runtime.
    .get("/wrong-shape", { response: z.object({ title: z.string().min(5) }) }, () => ({
      title: "x",
    }));
  return { app, logError };
}

async function problemOf(response: Response) {
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  return problemSchema.parse(await response.json());
}

const json = (body: string) =>
  new Request("http://localhost/albums", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("problemDetails", () => {
  test("invalid query values are validation_failed, with each invalid input", async () => {
    const { app } = testApp();
    const response = await app.handle("/albums?limit=-5");
    expect(response.status).toBe(422);
    expect(await problemOf(response)).toEqual({
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      code: "validation_failed",
      instance: "/albums",
      detail: "The request has invalid values.",
      errors: [{ path: "query.limit", message: "Too small: expected number to be >0" }],
    });
  });

  test("nested body errors name their path", async () => {
    const { app } = testApp();
    const problem = await problemOf(await app.handle(json('{"title":"","tags":[1]}')));
    expect(problem.code).toBe("validation_failed");
    expect(problem.errors?.map((error) => error.path)).toEqual(["body.title", "body.tags.0"]);
  });

  test("an unparsable body is validation_failed", async () => {
    const { app } = testApp();
    const response = await app.handle(json("{not json"));
    expect(response.status).toBe(400);
    expect(await problemOf(response)).toMatchObject({
      code: "validation_failed",
      detail: "The request body could not be parsed.",
    });
  });

  test("unexpected errors are a bare internal_error, logged but never exposed", async () => {
    const { app, logError } = testApp();
    const response = await app.handle("/boom");
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("secret");
    expect(JSON.parse(body)).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "internal_error",
      instance: "/boom",
    });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[1]).toBe("/boom");
  });

  test("a response that breaks its own schema is an internal_error", async () => {
    const { app, logError } = testApp();
    const response = await app.handle("/wrong-shape");
    expect(response.status).toBe(500);
    expect((await problemOf(response)).code).toBe("internal_error");
    expect(logError).toHaveBeenCalledTimes(1);
  });

  test("valid requests are untouched", async () => {
    const { app } = testApp();
    const response = await app.handle("/albums?limit=20");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ limit: 20 });
  });
});
