// CORS (TS-102): credentialed requests only from the web app's exact origin, preflights cached for 10 minutes.
// Native apps and MCP send bearer tokens and need none (TS-08). CSRF origin checks follow in TON-10.

import { cors } from "@elysia/cors";

import type { ApiConfig } from "./config";

export function webCors({ webOrigin }: Pick<ApiConfig, "webOrigin">) {
  return cors({
    origin: [webOrigin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["content-type"],
    // The web app reads Retry-After from rate-limited responses (TS-104).
    exposeHeaders: ["retry-after"],
    maxAge: 600,
  });
}
