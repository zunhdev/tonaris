// The /v1 OpenAPI 3.1 document, generated from the routes' Zod schemas (TS-09). It is served at
// /v1/openapi.json and committed at apps/api/openapi/v1.json, the contract native clients generate from.
// `bun run openapi:generate` rewrites the committed file; `bun run openapi:check` fails when it is stale.

import path from "node:path";

import { toOpenAPISchema } from "@elysia/openapi";
import type { AnyElysia } from "elysia";
import { z } from "zod";

import { changeSchema, problemSchema, streamResetSchema } from "@tonaris/domain";

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

/** Whether a generated response is `problemSchema` inlined, which routes declare for their error statuses. */
function isInlinedProblem(response: unknown, problem: string): boolean {
  if (typeof response !== "object" || response === null || !("content" in response)) return false;
  const content: unknown = response.content;
  if (typeof content !== "object" || content === null || !("application/json" in content))
    return false;
  const json: unknown = content["application/json"];
  if (typeof json !== "object" || json === null || !("schema" in json)) return false;
  const { schema } = json;
  if (typeof schema !== "object" || schema === null) return false;
  const rest = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$schema"));
  return JSON.stringify(rest) === problem;
}

/**
 * Puts `null` back into nullable enums. `toOpenAPISchema` turns Zod's `anyOf: [{enum}, {type: "null"}]` into
 * `type: [..., "null"]` but keeps the enum without null, which would make null invalid for generated clients.
 */
function allowNullInEnums(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) allowNullInEnums(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (
    "type" in value &&
    "enum" in value &&
    Array.isArray(value.type) &&
    Array.isArray(value.enum)
  ) {
    if (value.type.includes("null") && !value.enum.includes(null)) value.enum.push(null);
  }
  for (const child of Object.values(value)) allowNullInEnums(child);
}

/** Builds the document for the routes registered on `app`. */
export function openApiDocument(app: AnyElysia) {
  const problem = JSON.stringify(jsonSchema(problemSchema));
  const { paths, components } = toOpenAPISchema(
    app,
    { paths: [/\/openapi\.json$/] },
    undefined,
    undefined,
    openapiVersion,
  );
  allowNullInEnums(paths);
  // Every operation can answer with a problem; listing it once per operation keeps generated clients honest.
  // Error statuses a route declares with `problemSchema` point at the same component, as problem+json.
  for (const operations of Object.values(paths ?? {})) {
    for (const operation of Object.values(operations ?? {})) {
      if (typeof operation === "object" && operation !== null && "responses" in operation) {
        const responses = Object.entries(operation.responses ?? {}).map(([status, response]) => [
          status,
          isInlinedProblem(response, problem) ? problemResponse : response,
        ]);
        operation.responses = { ...Object.fromEntries(responses), default: problemResponse };
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
      // Problem, and the stream's events, which stream routes reference (TS-23).
      schemas: {
        ...components?.schemas,
        Problem: jsonSchema(problemSchema),
        Change: jsonSchema(changeSchema),
        StreamReset: jsonSchema(streamResetSchema),
      },
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
