// A shared page follows its owner's saves (FR-07.11, TS-23): the stream (a link's, or a signed-in viewer's) sends
// `shared-invalidate` after each, and the page reads the share again, 250 ms after the last of a burst. Read with
// `fetch`, as the owner's client reads its stream, with the session's cookie when there is one, reconnecting with
// growing pauses after a drop. Stops once the share is no longer available. A tab opens one stream per share, however
// many follow it: the shared view and the sidebar's tree (TON-130).

import { apiUrl } from "@/config";
import { useEffect } from "react";

const debounceMs = 250;

type Follow = { readers: Set<() => void>; stop: () => void };

/** The streams this tab follows, by path. */
const follows = new Map<string, Follow>();

function open(path: string): Follow {
  const readers = new Set<() => void>();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pause = 1_000;
  const readAll = () => {
    for (const read of readers) read();
  };
  const invalidate = () => {
    clearTimeout(timer);
    timer = setTimeout(readAll, debounceMs);
  };
  const stop = () => {
    controller.abort();
    clearTimeout(timer);
    if (follows.get(path)?.stop === stop) follows.delete(path);
  };
  const connect = async () => {
    while (!controller.signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetch(`${apiUrl}${path}`, {
          credentials: "include",
          signal: controller.signal,
        });
        // The share stopped being available: its readers read again and show why.
        if (response.status === 404) {
          readAll();
          stop();
          return;
        }
        if (response.ok && response.body) {
          pause = 1_000;
          const decoder = new TextDecoder();
          let text = "";
          // oxlint-disable-next-line no-await-in-loop
          for await (const chunk of response.body) {
            text += decoder.decode(chunk, { stream: true });
            const blocks = text.split("\n\n");
            text = blocks.pop() ?? "";
            if (blocks.some((block) => block.includes("event: shared-invalidate"))) invalidate();
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, pause * (0.5 + Math.random())));
      pause = Math.min(pause * 2, 30_000);
    }
  };
  void connect();
  return { readers, stop };
}

/** Follows the stream at `path`, under the API, e.g. `/v1/s/{token}/stream`. */
export function useShareStream(path: string, live: boolean, reread: () => void): void {
  useEffect(() => {
    if (!live) return () => {};
    let follow = follows.get(path);
    if (!follow) {
      follow = open(path);
      follows.set(path, follow);
    }
    const { readers, stop } = follow;
    readers.add(reread);
    return () => {
      readers.delete(reread);
      if (readers.size === 0) stop();
    };
  }, [path, live, reread]);
}
