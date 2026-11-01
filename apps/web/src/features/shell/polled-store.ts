// A list the page reads from the API again and again, shared by every component that shows it (DS-31, DS-86), for
// what no stream of this client carries, such as another account's invitations or an AI client's requests. It is
// read when the first reader mounts, when the window regains focus, every `everyMs`, and on `refresh()`, and stops
// once the last reader goes. Readers update only when a read brings a different list, by IDs in order.

import { useEffect, useSyncExternalStore } from "react";

export function createPolledStore<List extends readonly { id: string }[]>({
  read,
  everyMs,
}: {
  /** The list as the API has it now; undefined when the API didn't answer it. */
  read: () => Promise<List | undefined>;
  everyMs: number;
}) {
  /** Undefined until the first read answers. */
  let list: List | undefined;
  const listeners = new Set<() => void>();
  let readers = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const idsOf = (each: List | undefined) => each?.map(({ id }) => id).join(",");

  /** Reads the list again; its readers update when it changed. */
  function refresh(): void {
    read()
      .then((answered) => {
        if (answered === undefined || idsOf(answered) === idsOf(list)) return answered;
        list = answered;
        for (const listener of listeners) listener();
        return answered;
      })
      .catch(() => {});
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  /** Keeps the list current, starting with the first reader; answers how to stop, which the last reader's does. */
  function follow(): () => void {
    readers += 1;
    if (readers === 1) {
      refresh();
      timer = setInterval(refresh, everyMs);
      globalThis.addEventListener("focus", refresh);
    }
    return () => {
      readers -= 1;
      if (readers > 0) return;
      clearInterval(timer);
      globalThis.removeEventListener("focus", refresh);
    };
  }

  /** The list, kept current while the component shows it; undefined until the first read answers. */
  function useList(): List | undefined {
    useEffect(follow, []);
    return useSyncExternalStore(
      subscribe,
      () => list,
      () => undefined,
    );
  }

  return { refresh, follow, subscribe, current: () => list, useList };
}
