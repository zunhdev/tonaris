// A polled list (DS-31, DS-86): read while followed, and its readers told only when the list changed.

import { describe, expect, test } from "bun:test";

import { createPolledStore } from "./polled-store";

type Item = { id: string };

/** A store whose reads answer `answers` in turn, the last one again once they run out. */
function polled(...answers: (Item[] | undefined)[]) {
  let reads = 0;
  const store = createPolledStore<Item[]>({
    read: () => Promise.resolve(answers[Math.min(reads++, answers.length - 1)]),
    everyMs: 60_000,
  });
  return { store, reads: () => reads };
}

describe("createPolledStore", () => {
  test("its readers hear of a different list, not of the same one again or of no answer", async () => {
    const { store } = polled([{ id: "a" }], [{ id: "a" }], undefined, [{ id: "b" }]);
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    expect(store.current()).toBeUndefined();
    for (const expected of [1, 1, 1, 2]) {
      store.refresh();
      // Each read answers before the next one starts.
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(0);
      expect(heard).toBe(expected);
    }
    expect(store.current()).toEqual([{ id: "b" }]);
  });

  test("the first reader starts the reads and the window's focus reads again, until the last one stops", async () => {
    const { store, reads } = polled([]);
    const stopFirst = store.follow();
    const stopSecond = store.follow();
    expect(reads()).toBe(1);
    globalThis.dispatchEvent(new Event("focus"));
    expect(reads()).toBe(2);
    stopFirst();
    globalThis.dispatchEvent(new Event("focus"));
    expect(reads()).toBe(3);
    stopSecond();
    globalThis.dispatchEvent(new Event("focus"));
    expect(reads()).toBe(3);
    await Bun.sleep(0);
  });
});
