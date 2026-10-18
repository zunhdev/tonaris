// Placeholder for the web app so `bun dev` can run both apps (TS-06).
// TON-7 replaces it with the TanStack Start dev server (Vite), which also runs on port 3000.
// The port is fixed rather than read from PORT, so a PORT set in the shell can't collide with the API.

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tonaris (placeholder)</title>
  </head>
  <body>
    <h1>Tonaris</h1>
    <p>Web app placeholder. The app shell arrives with the web skeleton.</p>
    <ul>
      <li><a href="http://localhost:3001/healthz">API health check</a></li>
      <li><a href="http://localhost:8025">Mailpit inbox</a></li>
    </ul>
  </body>
</html>
`;

const server = Bun.serve({
  port: 3000,
  fetch: () => new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
});

console.log(`tonaris-web (placeholder) listening on ${server.url.href}`);
