// The connection as the workspace reports it (DS-81, TS-24). The engine knows whether its stream is live; this
// tells a brief drop, *reconnecting*, from being *offline*: the browser reporting no network, or 15 s without the
// stream. That is the window a write gets before it shows as unconfirmed, so past it nothing can be saved anyway,
// and a deploy's reconnects, spread over the first half second (TS-23), never read as offline.
//
// Only time the page is shown counts (TON-137). A phone freezes a hidden page, an installed app on Android often,
// and its stream drops meanwhile; a timer started before then fired as soon as the page came back, while the stream
// was still waiting out its backoff, so the notice flashed on almost every return to the app. Hidden, the window
// stops; shown again, it starts afresh, as when the network comes back.

import type { SyncEngine } from "./engine";

export type Connection = "connecting" | "connected" | "reconnecting" | "offline";

/** Whether the browser has a network, and its `online` and `offline` events. */
export type Network = {
  readonly onLine: boolean;
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
};

/** The browser's: `navigator.onLine`, and the window's events. */
export function browserNetwork(): Network {
  return {
    get onLine() {
      return navigator.onLine;
    },
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}

/** Whether the page is shown, with its `visibilitychange` and `resume` (unfrozen) events. */
export type PageVisibility = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange" | "resume", listener: () => void): void;
  removeEventListener(type: "visibilitychange" | "resume", listener: () => void): void;
};

/** The browser's: `document.hidden`, and the document's events. */
export function browserPage(): PageVisibility {
  return {
    get hidden() {
      return document.hidden;
    },
    addEventListener: (type, listener) => document.addEventListener(type, listener),
    removeEventListener: (type, listener) => document.removeEventListener(type, listener),
  };
}

export type ConnectionWatch = ReturnType<typeof watchConnection>;

export function watchConnection({
  engine,
  network,
  page,
  offlineAfterMs = 15_000,
}: {
  engine: Pick<SyncEngine, "status" | "onStatus">;
  network: Network;
  /** The page's visibility: hidden time doesn't count toward the window. */
  page?: PageVisibility;
  /** How long the stream may be down, with a network, before the workspace counts as offline. */
  offlineAfterMs?: number;
}) {
  const listeners = new Set<() => void>();
  let state: Connection = network.onLine ? "connecting" : "offline";
  /** Whether the stream has been live: a drop after that is reconnecting, not connecting. */
  let wasLive = false;
  /** Whether the stream has been down for `offlineAfterMs`. */
  let tooLong = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: Connection) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  function evaluate(): void {
    const status = engine.status;
    // Without a network the stream is gone too, even before it notices.
    if (!network.onLine) {
      set("offline");
      return;
    }
    if (status === "live") {
      wasLive = true;
      tooLong = false;
      clearTimeout(timer);
      timer = undefined;
      set("connected");
      return;
    }
    // Stopping or a session that ended takes the workspace away; there is nothing to report.
    if (status === "stopped" || status === "signed_out") return;
    // Hidden, the window waits: the stream gets all of it once the page is shown again.
    if (page?.hidden) {
      clearTimeout(timer);
      timer = undefined;
      tooLong = false;
      set(wasLive ? "reconnecting" : "connecting");
      return;
    }
    if (tooLong) {
      set("offline");
      return;
    }
    timer ??= setTimeout(() => {
      tooLong = true;
      evaluate();
    }, offlineAfterMs);
    set(wasLive ? "reconnecting" : "connecting");
  }

  /** Back online: the stream gets the full window again to come back. */
  const online = () => {
    tooLong = false;
    clearTimeout(timer);
    timer = undefined;
    evaluate();
  };
  const offline = () => evaluate();
  /** Shown again, or unfrozen: a fresh window, as when the network comes back. */
  const shown = () => {
    if (page?.hidden) evaluate();
    else online();
  };

  const unsubscribe = engine.onStatus(evaluate);
  network.addEventListener("online", online);
  network.addEventListener("offline", offline);
  page?.addEventListener("visibilitychange", shown);
  page?.addEventListener("resume", shown);
  evaluate();

  return {
    get state(): Connection {
      return state;
    },
    /** Calls `listener` whenever the state changes; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop(): void {
      clearTimeout(timer);
      unsubscribe();
      network.removeEventListener("online", online);
      network.removeEventListener("offline", offline);
      page?.removeEventListener("visibilitychange", shown);
      page?.removeEventListener("resume", shown);
    },
  };
}
