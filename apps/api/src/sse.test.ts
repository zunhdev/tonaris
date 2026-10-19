// SSE on Elysia 2's Bun adapter (TS-23, TON-19), on a listening server with a short idle timeout: framing, the
// keepalive that outlives Bun's idle timeout, resuming after Last-Event-ID, leaving when the client goes, ending
// on shutdown, Eden's types and the OpenAPI document.

import { afterEach, describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { type AnyElysia, Elysia, type SSEPayload, sse } from "elysia";
import { z } from "zod";

import { openApiDocument } from "./openapi";
import { type EventChannel, eventChannel, eventStream } from "./sse";

type Change = { seq: number; kind: "album" };
type ChangeEvent = SSEPayload<Change, "change"> & { id: string; data: Change };

const changeEvent = (seq: number): ChangeEvent => ({
  id: String(seq),
  event: "change",
  data: { seq, kind: "album" },
});

/** An app with one stream that replays history after Last-Event-ID, as the owner stream will (TS-23). */
function streamingApp({ keepaliveMs, history = [] }: { keepaliveMs: number; history?: number[] }) {
  const channels = new Set<EventChannel<ChangeEvent>>();
  const shutdown = new AbortController();
  const app = new Elysia()
    .get(
      "/stream",
      {
        headers: z.object({ "last-event-id": z.string().optional() }),
        detail: {
          operationId: "streamChanges",
          responses: {
            200: {
              description: "Changes, as server-sent events",
              // A component reference: Zod's JSON Schema type doesn't fit openapi-types' schema objects.
              content: { "text/event-stream": { schema: { $ref: "#/components/schemas/Change" } } },
            },
          },
        },
      },
      async function* ({ request, server, headers }) {
        const channel = eventChannel<ChangeEvent>(() => channels.delete(channel));
        channels.add(channel);
        const after = Number(headers["last-event-id"] ?? 0);
        for (const seq of history.filter((s) => s > after)) channel.push(changeEvent(seq));
        yield* eventStream(channel, { request, server, keepaliveMs, signal: shutdown.signal });
      },
    )
    // Without eventStream: a stream that goes quiet for longer than the idle timeout.
    .get("/quiet", async function* () {
      yield sse({ data: "first" });
      await Bun.sleep(6_000);
      yield sse({ data: "second" });
    });
  return { app, channels, shutdown };
}

const running: AnyElysia[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => Promise.resolve(app.stop(true))));
});

/**
 * Listens with a 1 s idle timeout. Bun checks idle connections on a tick of about 4 s, so a quiet connection is
 * cut after 4 s here, and after about 12 s with the default 10 s.
 */
function listen(app: AnyElysia) {
  app.listen({ port: 0, idleTimeout: 1 });
  running.push(app);
  return (app.server?.url.href ?? "").replace(/\/$/, "");
}

/** Reads a stream's text as it arrives, with the time of each chunk. */
async function open(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const response = await fetch(url, { ...init, signal: controller.signal });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const startedAt = performance.now();
  let text = "";
  let closed: string | undefined;
  const chunks: { at: number; text: string }[] = [];
  const reading = (async () => {
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        text += chunk;
        chunks.push({ at: performance.now() - startedAt, text: chunk });
      }
      closed = "ended";
    } catch (error) {
      closed = error instanceof Error ? error.name : "error";
    }
  })();
  return {
    response,
    chunks,
    get text() {
      return text;
    },
    get closed() {
      return closed;
    },
    /** Waits until the text so far satisfies `test`, or fails after `ms`. */
    async until(check: (text: string) => boolean, ms = 2_000) {
      const deadline = performance.now() + ms;
      while (!check(text)) {
        if (closed || performance.now() > deadline)
          throw new Error(`stream ${closed ?? "timed out"} with ${JSON.stringify(text)}`);
        // oxlint-disable-next-line no-await-in-loop
        await Bun.sleep(10);
      }
    },
    abort: () => controller.abort(),
    finished: reading,
  };
}

describe("eventStream", () => {
  test("starts the response at once and frames events", async () => {
    const { app, channels } = streamingApp({ keepaliveMs: 5_000 });
    const stream = await open(`${listen(app)}/stream`);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toBe("text/event-stream");
    expect(stream.response.headers.get("cache-control")).toBe("no-cache");
    await stream.until((text) => text === ": open\n\n");

    for (const channel of channels) channel.push(changeEvent(1));
    await stream.until((text) => text.endsWith('data: {"seq":1,"kind":"album"}\n\n'));
    expect(stream.text).toBe(': open\n\nid: 1\nevent: change\ndata: {"seq":1,"kind":"album"}\n\n');
    stream.abort();
  });

  test("outlives Bun's idle timeout with keepalives, which a quiet stream doesn't", async () => {
    const { app, channels } = streamingApp({ keepaliveMs: 400 });
    const base = listen(app);
    const [kept, quiet] = await Promise.all([open(`${base}/stream`), open(`${base}/quiet`)]);

    // Past the idle timeout's first check: the quiet stream is cut, the kept one is still open.
    await Bun.sleep(4_500);
    expect(quiet.text).toBe("data: first\n\n");
    expect(quiet.closed).toBeDefined();
    expect(kept.closed).toBeUndefined();
    expect(kept.text.split(": keepalive\n\n").length - 1).toBeGreaterThanOrEqual(8);

    for (const channel of channels) channel.push(changeEvent(7));
    await kept.until((text) => text.includes("id: 7\n"));
    kept.abort();
  }, 10_000);

  test("keepalives go out only while no event does", async () => {
    const { app, channels } = streamingApp({ keepaliveMs: 300 });
    const stream = await open(`${listen(app)}/stream`);
    await stream.until((text) => text.startsWith(": open"));
    for (let seq = 1; seq <= 5; seq++) {
      for (const channel of channels) channel.push(changeEvent(seq));
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(100);
    }
    expect(stream.text).not.toContain("keepalive");
    await stream.until((text) => text.endsWith(": keepalive\n\n"));
    stream.abort();
  });

  test("resumes after Last-Event-ID", async () => {
    const { app } = streamingApp({ keepaliveMs: 5_000, history: [1, 2, 3, 4] });
    const stream = await open(`${listen(app)}/stream`, { headers: { "last-event-id": "2" } });
    await stream.until((text) => text.includes("id: 4\n"));
    expect([...stream.text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1])).toEqual(["3", "4"]);
    stream.abort();
  });

  test("leaves its channel as soon as the client goes", async () => {
    const { app, channels } = streamingApp({ keepaliveMs: 5_000 });
    const base = listen(app);
    const streams = await Promise.all([1, 2, 3].map(() => open(`${base}/stream`)));
    await Promise.all(streams.map((s) => s.until((text) => text.startsWith(": open"))));
    expect(channels.size).toBe(3);

    streams[0]?.abort();
    const deadline = performance.now() + 500;
    while (channels.size > 2 && performance.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(10);
    }
    expect(channels.size).toBe(2);
    for (const stream of streams) stream.abort();
  });

  test("ends every stream on shutdown, so a graceful stop completes", async () => {
    const { app, channels, shutdown } = streamingApp({ keepaliveMs: 5_000 });
    const base = listen(app);
    const streams = await Promise.all([1, 2].map(() => open(`${base}/stream`)));
    await Promise.all(streams.map((s) => s.until((text) => text.startsWith(": open"))));

    shutdown.abort();
    await Promise.all(streams.map((s) => s.finished));
    expect(streams.map((s) => s.closed)).toEqual(["ended", "ended"]);
    expect(channels.size).toBe(0);
    const stoppedAt = performance.now();
    await app.stop();
    expect(performance.now() - stoppedAt).toBeLessThan(1_000);
  });
});

describe("eventChannel", () => {
  test("hands out queued events, then waits, and ends a waiting reader at once", async () => {
    let ended = 0;
    const channel = eventChannel<number>(() => ended++);
    channel.push(1);
    channel.push(2);
    expect(await channel.next()).toEqual({ done: false, value: 1 });
    expect(await channel.next()).toEqual({ done: false, value: 2 });
    const waiting = channel.next();
    await channel.return?.();
    expect(await waiting).toEqual({ done: true, value: undefined });
    channel.push(3);
    expect(await channel.next()).toEqual({ done: true, value: undefined });
    channel.end();
    expect(ended).toBe(1);
  });
});

describe("Eden and OpenAPI", () => {
  test("Eden types the events, and skips the comments", async () => {
    const { app, channels, shutdown } = streamingApp({ keepaliveMs: 50 });
    const api = treaty(app);
    const { data, status } = await api.stream.get({ headers: { "last-event-id": "0" } });
    expect(status).toBe(200);
    setTimeout(() => {
      for (const channel of channels) channel.push(changeEvent(9));
    }, 150);
    if (!data) throw new Error("no stream");
    for await (const item of data) {
      // `item.data` is typed `Change` for change events; a wrong field here fails `tsc`.
      if (item.event === "change") {
        const seq: number = item.data.seq;
        expect(seq).toBe(9);
        // Eden parses an id that looks like a number into one, though its type says string.
        expect(item.id as unknown).toBe(9);
        break;
      }
    }
    shutdown.abort();
  });

  test("documents a stream through detail.responses", () => {
    const { app } = streamingApp({ keepaliveMs: 5_000 });
    const { paths } = openApiDocument(app);
    const operation = paths?.["/stream"]?.get;
    expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "default"]);
    expect(operation?.responses?.["200"]).toMatchObject({
      content: { "text/event-stream": { schema: { $ref: "#/components/schemas/Change" } } },
    });
    expect(operation?.parameters).toContainEqual(
      expect.objectContaining({ name: "last-event-id", in: "header" }),
    );
  });
});
