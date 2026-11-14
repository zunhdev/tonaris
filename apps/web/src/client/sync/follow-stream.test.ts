// Following a share's stream (TS-23, TON-211): one connection per stream however many follow it, a reconnect after a
// drop that tells followers they missed notices, a silent connection dropped, a pause cut short when the page comes
// back, and an end for everyone on a 404.

import { afterEach, describe, expect, test } from "bun:test";

import { followStream, resumeStreams, type StreamState } from "./follow-stream";

/** A fake server: each request gets a stream the test writes to, or the status it was told to answer. */
function server() {
  const encoder = new TextEncoder();
  const connections: {
    url: string;
    signal: AbortSignal;
    send(text: string): void;
    close(): void;
  }[] = [];
  const statuses: number[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    const signal = init?.signal ?? new AbortController().signal;
    const status = statuses.shift();
    if (status !== undefined) return Promise.resolve(new Response(null, { status }));
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
    connections.push({
      url,
      signal,
      send: (text) => controller.enqueue(encoder.encode(text)),
      close: () => controller.close(),
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetch, connections, statuses };
}

const until = async (condition: () => boolean, ms = 1_000) => {
  const deadline = Date.now() + ms;
  // oxlint-disable-next-line no-await-in-loop
  while (!condition() && Date.now() < deadline) await Bun.sleep(5);
};

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

const fast = { backoff: { minMs: 10, maxMs: 20 } };

describe("followStream", () => {
  test("two followers share one connection, and each hears its events", async () => {
    const { fetch, connections } = server();
    const heard: string[] = [];
    stops.push(
      followStream(
        "https://api.test/one",
        { onEvent: (e) => heard.push(`a:${e.event}`) },
        { fetch },
      ),
      followStream(
        "https://api.test/one",
        { onEvent: (e) => heard.push(`b:${e.event}`) },
        { fetch },
      ),
    );
    await until(() => connections.length === 1);
    connections[0]?.send("event: shared-invalidate\ndata: {}\n\n");
    await until(() => heard.length === 2);
    expect(connections).toHaveLength(1);
    expect(heard).toEqual(["a:shared-invalidate", "b:shared-invalidate"]);
  });

  test("a dropped connection comes back, and followers hear they missed notices", async () => {
    const { fetch, connections } = server();
    const states: [StreamState, boolean][] = [];
    stops.push(
      followStream(
        "https://api.test/two",
        { onState: (state, missed) => states.push([state, missed]) },
        { fetch, ...fast },
      ),
    );
    await until(() => states.some(([state]) => state === "open"));
    connections[0]?.close();
    await until(() => connections.length === 2 && states.length >= 4);
    expect(states).toEqual([
      ["connecting", false],
      ["open", false],
      ["retrying", false],
      ["open", true],
    ]);
  });

  test("a connection that goes silent is dropped and opened again", async () => {
    const { fetch, connections } = server();
    stops.push(followStream("https://api.test/three", {}, { fetch, ...fast, silenceMs: 50 }));
    await until(() => connections.length === 1);
    await until(() => connections.length === 2, 500);
    expect(connections[0]?.signal.aborted).toBe(true);
  });

  test("a 404 ends the stream for every follower, and it isn't tried again", async () => {
    const { fetch, statuses } = server();
    statuses.push(404);
    const ended: number[] = [];
    stops.push(
      followStream("https://api.test/four", { onEnd: (s) => ended.push(s) }, { fetch, ...fast }),
      followStream("https://api.test/four", { onEnd: (s) => ended.push(s) }, { fetch, ...fast }),
    );
    await until(() => ended.length === 2);
    await Bun.sleep(50);
    expect(ended).toEqual([404, 404]);
    expect(statuses).toEqual([]);
  });

  test("resuming cuts a long pause short", async () => {
    const { fetch, connections, statuses } = server();
    statuses.push(503);
    stops.push(
      followStream(
        "https://api.test/five",
        {},
        { fetch, backoff: { minMs: 60_000, maxMs: 60_000 } },
      ),
    );
    await Bun.sleep(30);
    expect(connections).toHaveLength(0);
    resumeStreams();
    await until(() => connections.length === 1);
    expect(connections).toHaveLength(1);
  });

  test("the last follower to leave closes the connection", async () => {
    const { fetch, connections } = server();
    const first = followStream("https://api.test/six", {}, { fetch });
    const second = followStream("https://api.test/six", {}, { fetch });
    await until(() => connections.length === 1);
    first();
    expect(connections[0]?.signal.aborted).toBe(false);
    second();
    expect(connections[0]?.signal.aborted).toBe(true);
  });
});
