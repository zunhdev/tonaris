// The TON-19 soak run: many SSE streams on Elysia 2's Bun adapter, with production settings (Bun's default 10 s
// idle timeout, a 20 s keepalive). Clients run in a second process, so they don't share the server's event loop.
//
//   bun apps/api/src/sse-soak.ts [--clients 1000] [--spread 2000] [--quiet 45] [--burst 20] [--rate 20]
//
// - connect: the clients connect over `spread` ms. Connecting all at once overflows a small listen backlog, such as
//   macOS's 128 (`kern.ipc.somaxconn`), and some connections are reset;
// - quiet: only keepalives for `quiet` seconds, longer than the idle timeout, which would cut a quiet stream;
// - burst: `rate` broadcasts a second to every stream for `burst` seconds;
// - then the clients leave, and the server checks that every channel ended and that a graceful stop completes.
// It prints a JSON summary: drops, events lost, delivery latency, memory.

import { parseArgs } from "node:util";

import { Elysia, type SSEPayload } from "elysia";

import { type EventChannel, eventChannel, eventStream } from "./sse";

type Tick = { seq: number; sentAt: number };
type TickEvent = SSEPayload<Tick, "tick"> & { id: string; data: Tick };

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    clients: { type: "string", default: "1000" },
    quiet: { type: "string", default: "45" },
    burst: { type: "string", default: "20" },
    rate: { type: "string", default: "20" },
    spread: { type: "string", default: "2000" },
    "client-of": { type: "string" },
  },
});
const clients = Number(values.clients);
const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN;
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

if (values["client-of"]) {
  // The client process: open the streams, count events and latencies, report on stdin's close.
  const url = values["client-of"];
  const latencies: number[] = [];
  const received: number[] = Array.from({ length: clients }, () => 0);
  const closes: string[] = [];
  const failedToConnect = new Set<number>();
  const controllers = Array.from({ length: clients }, () => new AbortController());
  const gap = Number(values.spread) / clients;
  const streams = Promise.all(
    controllers.map(async (controller, index) => {
      await Bun.sleep(index * gap);
      const response = await fetch(url, { signal: controller.signal }).catch(() => {
        failedToConnect.add(index);
        return undefined;
      });
      if (!response) return;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop
          const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
            const data = /^data: (.*)$/m.exec(buffer.slice(0, end))?.[1];
            buffer = buffer.slice(end + 2);
            if (!data) continue;
            const tick: Tick = JSON.parse(data);
            latencies.push(Date.now() - tick.sentAt);
            received[index] = (received[index] ?? 0) + 1;
          }
        }
        if (!controller.signal.aborted) closes.push("ended");
      } catch (error) {
        if (!controller.signal.aborted)
          closes.push(error instanceof Error ? error.message : "error");
      }
    }),
  );
  // The server says when to stop by closing stdin.
  for await (const _ of Bun.stdin.stream()) {
    // Nothing is sent on stdin; the loop ends when it closes.
  }
  for (const controller of controllers) controller.abort();
  await streams.catch(() => undefined);
  latencies.sort((a, b) => a - b);
  const connected = received.filter((_, index) => !failedToConnect.has(index));
  console.log(
    JSON.stringify({
      failedToConnect: failedToConnect.size,
      closes,
      receivedPerStream: { min: Math.min(...connected), max: Math.max(...connected) },
      latencyMs: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        max: latencies.at(-1),
      },
    }),
  );
  process.exit(0);
}

// The server process.
const channels = new Set<EventChannel<TickEvent>>();
const shutdown = new AbortController();
const app = new Elysia().get("/stream", async function* ({ request, server }) {
  const channel = eventChannel<TickEvent>(() => channels.delete(channel));
  channels.add(channel);
  yield* eventStream(channel, { request, server, signal: shutdown.signal });
});
app.listen({ port: 0 });
const url = `${app.server?.url.href}stream`;
const memory: Record<string, number> = { start: mb(process.memoryUsage().rss) };

const child = Bun.spawn(
  ["bun", import.meta.path, "--clients", String(clients), "--client-of", url],
  {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    // Bun's fetch allows 256 requests at once by default.
    env: { ...process.env, BUN_CONFIG_MAX_HTTP_REQUESTS: String(clients + 16) },
  },
);
const connectStarted = performance.now();
// Until every client is in, or none has joined for 3 s after the spread.
for (let last = -1, since = performance.now(); channels.size < clients;) {
  if (channels.size !== last) [last, since] = [channels.size, performance.now()];
  else if (performance.now() - since > 3_000 + Number(values.spread)) break;
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(50);
}
const connectMs = Math.round(performance.now() - connectStarted);
memory.connected = mb(process.memoryUsage().rss);
console.error(`${channels.size} streams open after ${connectMs} ms; quiet for ${values.quiet} s…`);

await Bun.sleep(Number(values.quiet) * 1_000);
const afterQuiet = channels.size;
console.error(`${afterQuiet} streams open after the quiet phase; bursting…`);

let seq = 0;
const interval = 1_000 / Number(values.rate);
const burstEnds = performance.now() + Number(values.burst) * 1_000;
while (performance.now() < burstEnds) {
  seq++;
  const event: TickEvent = { id: String(seq), event: "tick", data: { seq, sentAt: Date.now() } };
  for (const channel of channels) channel.push(event);
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(interval);
}
memory.afterBurst = mb(process.memoryUsage().rss);
const afterBurst = channels.size;
await Bun.sleep(500);

// The clients report and leave.
await child.stdin.end();
const report = JSON.parse(await new Response(child.stdout).text());
const leftAt = performance.now();
while (channels.size > 0 && performance.now() - leftAt < 5_000) {
  // oxlint-disable-next-line no-await-in-loop
  await Bun.sleep(20);
}
const leaveMs = Math.round(performance.now() - leftAt);
const remaining = channels.size;
shutdown.abort();
const stopAt = performance.now();
await app.stop();
const stopMs = Math.round(performance.now() - stopAt);

console.log(
  JSON.stringify(
    {
      clients,
      connectMs,
      openAfterQuiet: afterQuiet,
      openAfterBurst: afterBurst,
      eventsSent: seq,
      ...report,
      channelsLeftMs: leaveMs,
      channelsRemaining: remaining,
      gracefulStopMs: stopMs,
      rssMb: memory,
    },
    null,
    2,
  ),
);
