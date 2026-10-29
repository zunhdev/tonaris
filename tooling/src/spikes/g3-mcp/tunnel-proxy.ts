// TON-22 (G3): one local origin in front of the API and the web app, for a cloudflared quick tunnel, so Claude
// web and ChatGPT web can reach the MCP server and the browser keeps one host-only session cookie. Paths the
// API serves go to it; everything else goes to the web app. Production keeps two hosts (TS-08).
//
//   1. bun run build                                                        (both apps)
//   2. cloudflared tunnel --url http://localhost:8787                       (prints https://<name>.trycloudflare.com)
//   3. bun tooling/src/spikes/g3-mcp/tunnel-proxy.ts
//   4. In apps/api:  API_ORIGIN=$TUNNEL WEB_ORIGIN=$TUNNEL CLIENT_IP_HEADER=cf-connecting-ip bun dist/bin/server.js
//      In apps/web:  API_URL=$TUNNEL bun run start
//   5. Add $TUNNEL/mcp as a connector in each client (docs/spikes/2026-10-21-g3-mcp-oauth.md).
//
// Every request is logged with its status and time, so a client's OAuth and MCP traffic can be followed.

const port = Number(process.env.PORT ?? 8787);
const api = process.env.API_TARGET ?? "http://localhost:3001";
const web = process.env.WEB_TARGET ?? "http://localhost:3000";

const apiPaths = [/^\/mcp(\/|$)/, /^\/auth\//, /^\/\.well-known\//, /^\/v1\//, /^\/healthz$/];

/** An MCP request's JSON-RPC method, tool and protocol revision, read from a copy of its body. */
async function mcpSummary(request: Request): Promise<string> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => undefined);
  const messages = Array.isArray(body) ? body : [body];
  const methods = messages.map((message) => {
    if (typeof message !== "object" || message === null || !("method" in message)) return "?";
    const params: unknown = "params" in message ? message.params : undefined;
    const tool =
      typeof params === "object" && params !== null && "name" in params
        ? `:${String(params.name)}`
        : "";
    return `${String(message.method)}${tool}`;
  });
  const version = request.headers.get("mcp-protocol-version") ?? "no header";
  return ` (${methods.join(",")}; ${version})`;
}

function targetOf(pathname: string): string {
  return apiPaths.some((pattern) => pattern.test(pathname)) ? api : web;
}

Bun.serve({
  port,
  // MCP and sign-in requests are short; the web app's sync stream (TS-23) sends a keepalive every 20 s.
  idleTimeout: 60,
  async fetch(request) {
    const started = performance.now();
    const url = new URL(request.url);
    const target = targetOf(url.pathname);
    const mcp =
      url.pathname === "/mcp" && request.method === "POST" ? await mcpSummary(request) : "";
    const headers = new Headers(request.headers);
    // Bun decompresses upstream bodies but keeps their Content-Encoding, so ask for none. Deleting the header isn't
    // enough: Bun's fetch then asks for gzip itself, and the 4 MB sync bootstrap came back compressed (TON-85).
    headers.set("accept-encoding", "identity");
    headers.delete("host");
    let response: Response;
    try {
      response = await fetch(`${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        // The timeout would cut the sync stream, which stays open; the web app reconnects, but needn't.
        signal: url.pathname === "/v1/sync/stream" ? undefined : AbortSignal.timeout(30_000),
      });
    } catch (error) {
      response = new Response(`Proxy: ${target} is unreachable (${String(error)})`, {
        status: 502,
      });
    }
    const ms = Math.round(performance.now() - started);
    const agent = request.headers.get("user-agent")?.slice(0, 60) ?? "";
    console.log(
      `${new Date().toISOString()} ${request.method} ${url.pathname}${mcp} → ${response.status} ${ms}ms [${agent}]`,
    );
    return response;
  },
});

console.log(`Tunnel proxy on http://localhost:${port}: API paths → ${api}, the rest → ${web}`);
