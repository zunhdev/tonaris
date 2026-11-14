// A shared page follows its owner's saves (FR-07.11, TS-23): the stream (a link's, or a signed-in viewer's) sends
// `shared-invalidate` after each, and the page reads the share again, 250 ms after the last of a burst. It reads
// again too when the stream comes back after a drop, as after a phone slept, since notices sent meanwhile were
// missed; and once the share is no longer available, so the page shows why. A tab opens one stream per share,
// however many follow it: the shared view, the sidebar's tree and a share the person edits (follow-stream.ts).

import { followStream } from "@/client/sync/follow-stream";
import { apiUrl } from "@/config";
import { useEffect } from "react";

const debounceMs = 250;

/** Follows the stream at `path`, under the API, e.g. `/v1/s/{token}/stream`. */
export function useShareStream(path: string, live: boolean, reread: () => void): void {
  useEffect(() => {
    if (!live) return () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(reread, debounceMs);
    };
    const unfollow = followStream(`${apiUrl}${path}`, {
      onEvent: (event) => {
        if (event.event === "shared-invalidate") soon();
      },
      onState: (_state, missed) => {
        if (missed) soon();
      },
      onEnd: reread,
    });
    return () => {
      clearTimeout(timer);
      unfollow();
    };
  }, [path, live, reread]);
}
