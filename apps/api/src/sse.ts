// Server-sent events on Elysia 2's Bun adapter (TS-23), as the TON-19 spike proved them. A generator handler
// spreads a stream, `yield* eventStream(channel, context)`, and Elysia answers `text/event-stream`:
// - Bun closes a connection after 10 s without traffic (`idleTimeout`), which would cut a stream between 20 s
//   keepalives. So the stream switches the timeout off for its own request, and every other request keeps it.
// - A comment line goes out first, so the response starts at once, and again whenever `keepaliveMs` passes
//   without an event. EventSource and Eden skip comments.
// - The stream ends when the client goes away or `signal` aborts. A graceful stop waits for open responses, so
//   on shutdown the streams must end first.
// - Its end ends the source, so the subscriber leaves the hub. An async generator can't serve as the source:
//   its `return()` waits for the pending `next()`, which may wait forever. `eventChannel` returns at once.

import { type SSEPayload, type Server, sse } from "elysia";

/** A comment line. It carries no event, so its type has neither `event` nor `data`. */
export type Comment = SSEPayload<never, never>;

function comment(text: string): Comment {
  // Elysia writes a value's `toSSE()` as it is; `sse: true` marks the response as an event stream.
  const line = { id: null, sse: true, toSSE: () => `: ${text}\n\n` };
  return line;
}

type Result<Event> = IteratorResult<Event, undefined>;

export type EventChannel<Event> = AsyncIterator<Event, undefined> & {
  /** Queues an event for the stream. Pushes after the end are dropped. */
  push(event: Event): void;
  /** Ends the stream from the server's side. */
  end(): void;
  readonly ended: boolean;
};

/** A push source for one stream. `onEnd` runs once, when either side ends it. */
export function eventChannel<Event>(onEnd?: () => void): EventChannel<Event> {
  const queue: Result<Event>[] = [];
  let waiting: ((result: Result<Event>) => void) | undefined;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    queue.length = 0;
    waiting?.({ done: true, value: undefined });
    waiting = undefined;
    onEnd?.();
  };
  return {
    push(event) {
      if (ended) return;
      if (waiting) {
        waiting({ done: false, value: event });
        waiting = undefined;
      } else queue.push({ done: false, value: event });
    },
    end,
    get ended() {
      return ended;
    },
    next() {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      if (ended) return Promise.resolve({ done: true, value: undefined });
      return new Promise<Result<Event>>((resolve) => {
        waiting = resolve;
      });
    },
    return() {
      end();
      return Promise.resolve({ done: true, value: undefined });
    },
  };
}

export type EventStreamOptions = {
  request: Request;
  /** Elysia's `server`, null in-process (`app.handle`), where no idle timeout applies. */
  server: Server | null;
  /** How long the stream may go without sending anything. TS-23 says 20 s. */
  keepaliveMs?: number;
  /** Ends the stream, such as on shutdown. */
  signal?: AbortSignal;
};

/** The events of `source` as an SSE response body, kept alive and ended as above. */
export async function* eventStream<Event extends SSEPayload>(
  source: EventChannel<Event>,
  { request, server, keepaliveMs = 20_000, signal }: EventStreamOptions,
): AsyncGenerator<Event | Comment, void> {
  server?.timeout(request, 0);
  const stop = AbortSignal.any(signal ? [request.signal, signal] : [request.signal]);
  const stopped = new Promise<"stop">((resolve) => {
    if (stop.aborted) resolve("stop");
    stop.addEventListener("abort", () => resolve("stop"), { once: true });
  });
  try {
    yield comment("open");
    let next = source.next();
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<"idle">((resolve) => {
        timer = setTimeout(() => resolve("idle"), keepaliveMs);
      });
      // Waiting in turn for the next event, the keepalive and the end.
      // oxlint-disable-next-line no-await-in-loop
      const first = await Promise.race([next, idle, stopped]);
      clearTimeout(timer);
      if (first === "stop" || (first !== "idle" && first.done)) return;
      if (first === "idle") {
        yield comment("keepalive");
      } else {
        // `sse()` marks the event in place, giving it the `toSSE()` Elysia writes; its return type is generic.
        sse(first.value);
        yield first.value;
        next = source.next();
      }
    }
  } finally {
    source.end();
  }
}
