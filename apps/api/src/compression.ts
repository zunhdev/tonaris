// Gzip for JSON responses (TS-120): the bootstrap is most of a cold start uncompressed (2.33 MB for the reference
// workload, 0.49 MB gzipped). Elysia's `mapResponse` sees every response, so this covers handler results, problem
// documents and the JSON Better Auth and MCP answer with. The event stream and plain text pass untouched: a stream
// must never be buffered (TS-23).

import { Elysia } from "elysia";

/** Below this, gzip's framing eats most of the gain. */
const minBytes = 1_024;

const json = /^application\/(?:problem\+)?json\s*(?:;|$)/i;

/** Whether the client takes gzip: listed in `Accept-Encoding`, and not refused with `q=0`. */
function acceptsGzip(request: Request): boolean {
  return (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .map((part) => part.trim().split(";"))
    .some(
      ([coding, ...parameters]) =>
        coding?.toLowerCase() === "gzip" &&
        !parameters.some((parameter) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(parameter)),
    );
}

/** The JSON bytes and headers of a response this plugin may compress, if it is one. */
async function jsonBody(
  value: unknown,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; status?: number; headers: Headers } | undefined> {
  if (value instanceof Response) {
    const type = value.headers.get("content-type");
    if (!type || !json.test(type) || value.headers.has("content-encoding") || !value.body) {
      return undefined;
    }
    return {
      bytes: new Uint8Array(await value.arrayBuffer()),
      status: value.status,
      headers: new Headers(value.headers),
    };
  }
  // Plain objects and arrays, as handlers return them; generators (streams), strings and files pass.
  if (typeof value !== "object" || value === null || Symbol.asyncIterator in value)
    return undefined;
  if (value instanceof Blob || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return undefined;
  }
  return {
    bytes: new TextEncoder().encode(JSON.stringify(value)),
    headers: new Headers({ "content-type": "application/json;charset=utf-8" }),
  };
}

export function compression() {
  return new Elysia({ name: "compression" }).mapResponse(
    "global",
    async ({ request, responseValue }) => {
      if (request.method === "HEAD" || !acceptsGzip(request)) return undefined;
      const body = await jsonBody(responseValue);
      if (!body || body.bytes.byteLength < minBytes) {
        // A Response's body was read to measure it, so it goes out rebuilt.
        return body && responseValue instanceof Response
          ? new Response(body.bytes, { status: body.status, headers: body.headers })
          : undefined;
      }
      body.headers.set("content-encoding", "gzip");
      body.headers.set("vary", "accept-encoding");
      body.headers.delete("content-length");
      return new Response(Bun.gzipSync(body.bytes), {
        ...(body.status === undefined ? {} : { status: body.status }),
        headers: body.headers,
      });
    },
  );
}
