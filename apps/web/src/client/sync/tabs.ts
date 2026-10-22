// The tabs of one browser, signed in to one account, sharing a single change stream (TS-23). A leader, elected with
// a Web Lock, streams and relays each change to the others over a BroadcastChannel. Each tab also holds a lock of
// its own while it lives, so the others can tell when it is gone and adopt the writes it left unsent (TS-22).
// `memoryBrowser()` stands in for the browser in Bun, which has neither Web Locks nor a shared channel.

import type { Change } from "@tonaris/domain";

import type { ConnectionStatus } from "./engine";

/** What tabs tell each other. `hello` asks the leader to repeat its status, for a tab that just opened. */
export type TabMessage =
  | { type: "change"; change: Change }
  | { type: "status"; status: ConnectionStatus }
  | { type: "reset" }
  | { type: "hello" };

export type TabCoordinator = {
  /** This tab's ID, which owns its outbox entries. */
  readonly id: string;
  /** Resolves once this tab leads; it leads until `signal` aborts or the tab closes. */
  lead(signal: AbortSignal): Promise<void>;
  /** Sends `message` to every other tab. */
  post(message: TabMessage): void;
  subscribe(listener: (message: TabMessage) => void): () => void;
  /** Runs `task` while holding `tabId`'s lock, if that tab is gone; answers whether it ran. */
  adopt(tabId: string, task: () => Promise<void>): Promise<boolean>;
  /** Closes this tab: its locks go, and it leaves the channel. */
  close(): void;
};

/** A lock held until `release` aborts, as a Web Lock request whose callback waits on it. */
const holdUntil = (release: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (release.aborted) resolve();
    release.addEventListener("abort", () => resolve(), { once: true });
  });

/** This tab of the browser, for `accountId`. */
export function browserTabs(accountId: string): TabCoordinator {
  const id = crypto.randomUUID();
  const life = new AbortController();
  const channel = new BroadcastChannel(`tonaris-sync:${accountId}`);
  const listeners = new Set<(message: TabMessage) => void>();
  channel.addEventListener("message", (event: MessageEvent<TabMessage>) => {
    for (const listener of listeners) listener(event.data);
  });
  // A name no other tab uses, so it is granted at once.
  void navigator.locks.request(`tonaris-tab:${id}`, () => holdUntil(life.signal));

  return {
    id,
    lead(signal) {
      const release = AbortSignal.any([signal, life.signal]);
      return new Promise((resolve) => {
        navigator.locks
          .request(`tonaris-leader:${accountId}`, { signal: release }, () => {
            resolve();
            return holdUntil(release);
          })
          // Aborted before it was granted: this tab never leads.
          .catch(() => {});
      });
    },
    post(message) {
      // A BroadcastChannel reaches this origin's tabs only, so it takes no target origin.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      if (!life.signal.aborted) channel.postMessage(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    adopt: (tabId, task) =>
      navigator.locks.request(`tonaris-tab:${tabId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) return false;
        await task();
        return true;
      }),
    close() {
      life.abort();
      listeners.clear();
      channel.close();
    },
  };
}

/** Web Locks for one process: `request` waits its turn unless `ifAvailable`, as `navigator.locks.request` does. */
function memoryLocks() {
  const held = new Set<string>();
  const queues = new Map<string, (() => void)[]>();
  const release = (name: string) => {
    const next = queues.get(name)?.shift();
    if (next) next();
    else held.delete(name);
  };
  return {
    /** Takes `name` as soon as it is free, and holds it until `hold` settles. */
    async request(name: string, hold: () => Promise<unknown>, signal?: AbortSignal): Promise<void> {
      if (held.has(name)) {
        const granted = await new Promise<boolean>((resolve) => {
          const turn = () => resolve(true);
          queues.set(name, [...(queues.get(name) ?? []), turn]);
          signal?.addEventListener("abort", () => {
            const queue = queues.get(name) ?? [];
            if (!queue.includes(turn)) return;
            queues.set(
              name,
              queue.filter((waiting) => waiting !== turn),
            );
            resolve(false);
          });
        });
        if (!granted) return;
      } else held.add(name);
      try {
        await hold();
      } finally {
        release(name);
      }
    },
    /** Runs `task` holding `name` if it is free; answers whether it ran. */
    async ifAvailable(name: string, task: () => Promise<void>): Promise<boolean> {
      if (held.has(name)) return false;
      held.add(name);
      try {
        await task();
        return true;
      } finally {
        release(name);
      }
    },
  };
}

/** One browser's tabs in one process, for tests: `tab(accountId)` opens another. */
export function memoryBrowser() {
  const locks = memoryLocks();
  const channels = new Map<string, Set<(message: TabMessage) => void>>();

  return {
    tab(accountId: string): TabCoordinator {
      const id = crypto.randomUUID();
      const life = new AbortController();
      const listeners = new Set<(message: TabMessage) => void>();
      const receive = (message: TabMessage) => {
        for (const listener of listeners) listener(structuredClone(message));
      };
      const peers = channels.get(accountId) ?? new Set();
      channels.set(accountId, peers.add(receive));
      void locks.request(`tab:${id}`, () => holdUntil(life.signal));

      return {
        id,
        lead(signal) {
          const release = AbortSignal.any([signal, life.signal]);
          return new Promise((resolve) => {
            void locks.request(
              `leader:${accountId}`,
              () => {
                resolve();
                return holdUntil(release);
              },
              release,
            );
          });
        },
        post(message) {
          if (life.signal.aborted) return;
          // Delivered later, and never to the sender, as a BroadcastChannel does.
          for (const peer of peers) if (peer !== receive) setTimeout(() => peer(message), 0);
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        adopt: (tabId, task) => locks.ifAvailable(`tab:${tabId}`, task),
        close() {
          life.abort();
          listeners.clear();
          peers.delete(receive);
        },
      };
    },
  };
}
