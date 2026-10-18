// Placeholder for the web app so `bun dev` can run both apps (TS-06).
// TON-7 replaces it with the TanStack Start dev server (Vite), which also runs on port 3000.
// The port is fixed rather than read from PORT, so a PORT set in the shell can't collide with the API.
// Each page load asks the API for its health through the Eden client, server-side like an SSR loader (TS-03).

import { createApiClient } from "./api";

const apiUrl = Bun.env.API_INTERNAL_URL ?? "http://localhost:3001";
const api = createApiClient(apiUrl);

async function apiStatus(): Promise<string> {
  const { data, status } = await api.v1.health.get();
  return data ? `API status: ${data.status}` : `API unreachable (HTTP ${status}) at ${apiUrl}`;
}

const page = (status: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tonaris (placeholder)</title>
  </head>
  <body>
    <h1>Tonaris</h1>
    <p>Web app placeholder. The app shell arrives with the web skeleton.</p>
    <p>${Bun.escapeHTML(status)}</p>
    <ul>
      <li><a href="http://localhost:3001/v1/health">API health</a></li>
      <li><a href="http://localhost:3001/v1/openapi.json">API OpenAPI document</a></li>
      <li><a href="http://localhost:8025">Mailpit inbox</a></li>
    </ul>
  </body>
</html>
`;

const server = Bun.serve({
  port: 3000,
  fetch: async () =>
    new Response(page(await apiStatus()), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
});

console.log(`tonaris-web (placeholder) listening on ${server.url.href}`);
