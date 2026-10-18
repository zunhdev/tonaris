// Placeholder for the API service so `bun dev` can run both apps (TS-06).
// TON-6 replaces it with the Elysia app (TS-04); `/healthz` is the host health check (TS-110).

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3001),
  routes: {
    "/healthz": new Response("ok"),
  },
  fetch: () => new Response("Not found", { status: 404 }),
});

console.log(`tonaris-api (placeholder) listening on ${server.url.href}`);
