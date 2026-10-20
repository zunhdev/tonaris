// Reads a `text/event-stream` body (WHATWG HTML, server-sent events) from `fetch`, in browsers and in Bun alike.
// The client reads the stream with fetch rather than EventSource (TON-20): it can see the status of a refused
// stream (401), notice a connection that went silent, choose its own reconnect delays, and run in tests.

export type ServerSentEvent = { id: string | undefined; event: string; data: string };

/**
 * The events in `body`. `onBytes` runs for every chunk, comments included, so a reader can tell a live
 * connection from a dead one by the keepalives.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
  onBytes: () => void = () => {},
): AsyncGenerator<ServerSentEvent, void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventId: string | undefined;
  let event = "";
  let data: string[] = [];

  // A reader rather than `for await`: async iteration of streams is newer than some supported Safaris.
  const reader = body.getReader();
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) return;
      onBytes();
      buffer += decoder.decode(value, { stream: true });
      // A line ends at CRLF, LF or CR. A CR at the end of the buffer may be the start of a CRLF: wait for more.
      const lines = buffer.split(/\r\n|\n|\r(?!$)/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0)
            yield { id: lastEventId, event: event || "message", data: data.join("\n") };
          event = "";
          data = [];
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const text = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "data") data.push(text);
        else if (field === "event") event = text;
        else if (field === "id" && !text.includes("\0")) lastEventId = text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
