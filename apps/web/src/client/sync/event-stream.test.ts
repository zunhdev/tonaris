import { describe, expect, test } from "bun:test";

import { readEventStream, type ServerSentEvent } from "./event-stream";

/** A body that delivers `chunks` as they are, so events and line ends can straddle chunks. */
function body(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function events(chunks: string[]): Promise<ServerSentEvent[]> {
  const read: ServerSentEvent[] = [];
  for await (const event of readEventStream(body(chunks))) read.push(event);
  return read;
}

describe("readEventStream", () => {
  test("reads events as the API frames them, skipping comments", async () => {
    expect(
      await events([': open\n\nid: 1\nevent: change\ndata: {"seq":1}\n\n', ": keepalive\n\n"]),
    ).toEqual([{ id: "1", event: "change", data: '{"seq":1}' }]);
  });

  test("joins events and line ends split across chunks, CRLF included", async () => {
    expect(
      await events(["id: 7\r", "\nevent: cha", "nge\r\ndata: a\r\n", "data: b\r\n\r", "\n"]),
    ).toEqual([{ id: "7", event: "change", data: "a\nb" }]);
  });

  test("keeps the last id for later events, and defaults the type to message", async () => {
    expect(
      await events(["id: 3\ndata: x\n\n", "data: y\n\n", "event: reset\ndata: {}\n\n"]),
    ).toEqual([
      { id: "3", event: "message", data: "x" },
      { id: "3", event: "message", data: "y" },
      { id: "3", event: "reset", data: "{}" },
    ]);
  });

  test("dispatches nothing for a block without data, or an unfinished one", async () => {
    expect(await events(["event: change\n\n", "data: cut off"])).toEqual([]);
  });

  test("reports every chunk, keepalives too", async () => {
    let chunks = 0;
    for await (const _ of readEventStream(
      body([": open\n\n", ": keepalive\n\n"]),
      () => (chunks += 1),
    )) {
      // Comments only.
    }
    expect(chunks).toBe(2);
  });
});
