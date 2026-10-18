// The production web server (TS-01): Bun.serve answers the host's health check and the built client files, and
// hands every other request to Start's fetch handler, which renders pages and adds the security headers (TS-101).
// Run `bun run build` first, then `bun run start`. Listens on PORT (default 3000).

import path from "node:path";

type StartHandler = { fetch(request: Request): Response | Promise<Response> };

function isStartEntry(value: unknown): value is { default: StartHandler } {
  if (typeof value !== "object" || value === null || !("default" in value)) return false;
  const handler: unknown = value.default;
  return (
    typeof handler === "object" &&
    handler !== null &&
    "fetch" in handler &&
    typeof handler.fetch === "function"
  );
}

// Checked before listening: the page code that reads it loads on the first request, too late for the health check.
if (process.env.NODE_ENV === "production" && !process.env.API_URL) {
  throw new Error("Set API_URL in production (see .env.example).");
}

// Loaded at run time: the build writes it, and nothing type-checks against it.
const entry: unknown = await import(path.join(import.meta.dir, "dist/server/server.js")).catch(
  () => undefined,
);
if (!isStartEntry(entry)) {
  throw new Error("dist/server/server.js is missing: build the web app first (`bun run build`).");
}
const handler = entry.default;

const clientDir = path.join(import.meta.dir, "dist/client");

/** Headers for files served as they are; pages get theirs from Start's middleware (src/start.ts). */
function fileHeaders(file: string): Record<string, string> {
  return {
    // Vite fingerprints everything under assets/, so those files never change; the rest may.
    "cache-control": file.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
  };
}

/** One static route per built client file, read into memory once at start-up. */
async function clientFileRoutes(): Promise<Record<string, Response>> {
  const routes: Record<string, Response> = {};
  for await (const file of new Bun.Glob("**/*").scan(clientDir)) {
    const body = Bun.file(path.join(clientDir, file));
    routes[`/${file}`] = new Response(await body.bytes(), {
      headers: { "content-type": body.type, ...fileHeaders(file) },
    });
  }
  return routes;
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    // The host's health check (TS-110), outside Start.
    "/healthz": new Response("ok"),
    ...(await clientFileRoutes()),
  },
  fetch: (request) => handler.fetch(request),
});

console.log(`tonaris-web listening on ${server.url.href}`);
