// Test helpers for the sync client: the real API in a child process (apps/api/src/test-server.ts), and a fetch
// that signs requests in as one session and can lose requests, answers and streams on demand. Tests only.

import path from "node:path";

import { z } from "zod";

import { createSyncClient, type SyncClient, type SyncClientOptions } from "./client";
import type { Fetch } from "./engine";

const serverInfo = z.object({
  url: z.string(),
  webOrigin: z.string(),
  accounts: z.array(z.object({ id: z.string(), email: z.string(), sessions: z.array(z.string()) })),
});
export type TestServer = z.infer<typeof serverInfo> & { stop(): Promise<void> };

const script = path.join(import.meta.dir, "../../../../api/src/test-server.ts");

/** Starts the API on a fresh test schema with `accounts` accounts of two sessions each. */
export async function startApiServer(accounts: number): Promise<TestServer> {
  const child = Bun.spawn(["bun", script], {
    env: { ...process.env, TEST_ACCOUNTS: String(accounts) },
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n")) {
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) throw new Error("The test API exited before it was ready.");
    text += decoder.decode(value, { stream: true });
  }
  reader.releaseLock();
  const info = serverInfo.parse(JSON.parse(text.slice(0, text.indexOf("\n"))));
  return {
    ...info,
    async stop() {
      child.kill("SIGTERM");
      await child.exited;
    },
  };
}

/** What a session's network does wrong, for the next requests that match. */
export type Faults = {
  /** Every request fails before it is sent, as when the device is offline. */
  offline: boolean;
  /** Stream requests fail, while mutations still go through. */
  noStream: boolean;
  /** Write requests (a mutation or a batch) that fail before reaching the server. */
  failSends: number;
  /** Write requests the server handles whose answer is lost on the way back. */
  dropAnswers: number;
};

/** A fetch for one session: adds its cookie and the web origin, as the browser would, and injects `faults`. */
export function sessionFetch(server: TestServer, cookie: string) {
  const faults: Faults = { offline: false, noStream: false, failSends: 0, dropAnswers: 0 };
  const streams = new Set<AbortController>();
  const sent: string[] = [];
  const writes: string[] = [];
  let streamsOpened = 0;

  const fetcher: Fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("origin", server.webOrigin);
    const isStream = url.includes("/v1/sync/stream");
    const isWrite = url.endsWith("/v1/mutations") || url.endsWith("/v1/batches");
    if (faults.offline || (isStream && faults.noStream)) throw new TypeError("Failed to fetch");
    if (isWrite && faults.failSends > 0) {
      faults.failSends -= 1;
      throw new TypeError("Failed to fetch");
    }
    if (isWrite && typeof init.body === "string") {
      sent.push(init.body);
      writes.push(url.slice(url.lastIndexOf("/") + 1));
    }
    if (isStream) streamsOpened += 1;
    if (!isStream) {
      const response = await fetch(url, { ...init, headers });
      if (isWrite && faults.dropAnswers > 0) {
        faults.dropAnswers -= 1;
        await response.body?.cancel();
        throw new TypeError("The network connection was lost.");
      }
      return response;
    }
    // A stream the test can cut, as a network change or a proxy would.
    const cut = new AbortController();
    streams.add(cut);
    const signal = init.signal ? AbortSignal.any([init.signal, cut.signal]) : cut.signal;
    try {
      return await fetch(url, { ...init, headers, signal });
    } finally {
      signal.addEventListener("abort", () => streams.delete(cut), { once: true });
    }
  };

  return {
    fetch: fetcher,
    faults,
    /** The write bodies sent, retries included. */
    sent,
    /** Which endpoint each sent write went to: `mutations` or `batches`. */
    writes,
    /** Stream connections opened, reconnects included. */
    get streamsOpened(): number {
      return streamsOpened;
    },
    /** Cuts every open stream of this session. */
    cutStreams(): void {
      for (const cut of streams) cut.abort();
      streams.clear();
    },
  };
}

/** A started sync client for one session, with fast retries for tests. */
export function testClient(
  server: TestServer,
  cookie: string,
  options: Partial<SyncClientOptions> = {},
): SyncClient & { network: ReturnType<typeof sessionFetch> } {
  const network = sessionFetch(server, cookie);
  const client = createSyncClient({
    apiUrl: server.url,
    fetch: network.fetch,
    backoff: { minMs: 20, maxMs: 200 },
    requestTimeoutMs: 2_000,
    confirmWithinMs: 1_000,
    ...options,
  });
  client.start();
  return Object.assign(client, { network });
}

/** Waits until `check` holds, failing after `ms`. */
export async function until(check: () => boolean, ms = 3_000, what = "condition"): Promise<void> {
  const deadline = performance.now() + ms;
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(5);
  }
}
