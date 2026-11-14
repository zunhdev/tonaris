// The share a guest's page shows (DS-72, TS-23). The server reads it for the first paint; the page then reads it
// again after each of the owner's saves, in the browser. Only a 404 means the link stopped working. A read the API
// refuses for now (429, the guests' view limit, TS-104) or that fails keeps the share on screen and tries again,
// after the `Retry-After` the API gave or a short pause, so the page goes on following its owner (DRIFT-106).

import { api } from "@/api";
import { useShareStream } from "@/features/sharing/use-share-stream";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SharedSnapshot } from "@tonaris/domain";

/** What the server's read gave: the share, or why not. */
export type GuestLoad =
  | { snapshot: SharedSnapshot }
  | { snapshot: undefined; gone: true }
  | { snapshot: undefined; gone: false; retryAfterMs: number };

/** The pause after a failed read with no `Retry-After`, and the longest one taken. */
const retryMs = 5_000;
const maxRetryMs = 60_000;

/** The wait a `Retry-After` header asks for, in seconds; `retryMs` without one. */
export function retryAfterMs(header: string | null | undefined): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, maxRetryMs) : retryMs;
}

/** Reads the share behind `token` once; `fetchShare` is the API's read. */
export async function loadGuestShare(
  fetchShare: () => Promise<{
    data: SharedSnapshot | null;
    error: { status: unknown } | null;
    response?: Response;
  }>,
): Promise<GuestLoad> {
  try {
    const { data, error, response } = await fetchShare();
    if (data) return { snapshot: data };
    if (error?.status === 404) return { snapshot: undefined, gone: true };
    return {
      snapshot: undefined,
      gone: false,
      retryAfterMs: retryAfterMs(response?.headers.get("retry-after")),
    };
  } catch {
    return { snapshot: undefined, gone: false, retryAfterMs: retryMs };
  }
}

/**
 * The share to show for `token`, starting from the server's read: undefined while there is none yet, or once the
 * link stopped working (`gone`).
 */
export function useGuestShare(
  token: string,
  first: GuestLoad,
): { snapshot: SharedSnapshot | undefined; gone: boolean } {
  const [state, setState] = useState(() => ({
    snapshot: first.snapshot,
    gone: first.snapshot === undefined && first.gone,
  }));
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reread = useCallback(
    function read() {
      clearTimeout(retry.current);
      void loadGuestShare(() => api.v1.s({ token }).get()).then((loaded) => {
        if (loaded.snapshot) setState({ snapshot: loaded.snapshot, gone: false });
        else if (loaded.gone) setState({ snapshot: undefined, gone: true });
        // Refused for now, or not reached: what is shown stays, and the page tries again.
        else retry.current = setTimeout(read, loaded.retryAfterMs);
        return undefined;
      });
    },
    [token],
  );

  // The server's read was refused for now: try again from here.
  useEffect(() => {
    if (first.snapshot === undefined && !first.gone)
      retry.current = setTimeout(reread, first.retryAfterMs);
    return () => clearTimeout(retry.current);
  }, [first, reread]);

  useShareStream(`/v1/s/${token}/stream`, state.snapshot !== undefined, reread);
  return state;
}
