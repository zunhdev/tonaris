// The /v1 OpenAPI 3.1 document, generated from the routes' Zod schemas (TS-09). It is served at
// /v1/openapi.json and committed at apps/api/openapi/v1.json, the contract native clients generate from.
// `bun run openapi:generate` rewrites the committed file; `bun run openapi:check` fails when it is stale.

import path from "node:path";

import { toOpenAPISchema } from "@elysia/openapi";
import type { AnyElysia } from "elysia";
import { z } from "zod";

import { problemSchema } from "@tonaris/domain";

const openapiVersion = "3.1.2";
export const committedDocumentPath = path.join(import.meta.dir, "../openapi/v1.json");

const problemResponse = {
  description: "Problem details (RFC 9457) with a TS-27 `code`",
  content: {
    "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
  },
};

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
  return rest;
}

/** Builds the document for the routes registered on `app`. */
export function openApiDocument(app: AnyElysia) {
  const { paths, components } = toOpenAPISchema(
    app,
    { paths: [/\/openapi\.json$/] },
    undefined,
    undefined,
    openapiVersion,
  );
  // Every operation can answer with a problem; listing it once per operation keeps generated clients honest.
  for (const operations of Object.values(paths ?? {})) {
    for (const operation of Object.values(operations ?? {})) {
      if (typeof operation === "object" && operation !== null && "responses" in operation) {
        operation.responses = { ...operation.responses, default: problemResponse };
      }
    }
  }
  return {
    openapi: openapiVersion,
    info: {
      title: "Tonaris API",
      version: "1",
      description:
        "The /v1 contract shared by the web app, native clients and integrations. Changes within v1 are additive only.",
    },
    paths,
    components: {
      ...components,
      schemas: { ...components?.schemas, Problem: jsonSchema(problemSchema) },
    },
  };
}

/** Serves `openApiDocument` for the host app at `<prefix>/openapi.json`. Generic, so route types survive. */
export function openApiJson<const App extends AnyElysia>(app: App): App {
  let document: ReturnType<typeof openApiDocument> | undefined;
  app.get("/openapi.json", { detail: { hide: true } }, () => (document ??= openApiDocument(app)));
  return app;
}

/** The committed file's text: stable key order as generated, two-space indent, trailing newline. */
export function serializeDocument(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
