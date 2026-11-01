import { describe, expect, test } from "bun:test";

import { PacedQueue, retryAfterMs } from "./paced-queue";

/** A queue on a simulated clock, recording when each turn starts. */
function simulated(intervalMs: number) {
  let clock = 0;
  const queue = new PacedQueue(intervalMs, {
    now: () => clock,
    sleep: async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      clock += ms;
    },
  });
  const starts: [string, number][] = [];
  const take = async (name: string) => {
    await queue.turn();
    starts.push([name, clock]);
  };
  return { queue, starts, take };
}

describe("PacedQueue", () => {
  test("turns start in the order asked for, at least the interval apart", async () => {
    const { starts, take } = simulated(3_000);
    await Promise.all(["a", "b", "c"].map(take));
    expect(starts).toEqual([
      ["a", 0],
      ["b", 3_000],
      ["c", 6_000],
    ]);
  });

  test("a hold moves every waiting turn on, even one already asleep", async () => {
    const { queue, starts, take } = simulated(1_000);
    await take("a");
    const waiting = take("b");
    queue.holdFor(10_000);
    await waiting;
    expect(starts).toEqual([
      ["a", 0],
      ["b", 10_000],
    ]);
  });
});

describe("retryAfterMs", () => {
  test("Retry-After's seconds, or 2^retry seconds when longer", () => {
    expect([0, 1, 2, 3].map((retry) => retryAfterMs(null, retry))).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ]);
    expect(retryAfterMs("7", 0)).toBe(7_000);
    expect(retryAfterMs("7", 3)).toBe(8_000);
  });

  test("a Retry-After that isn't a number of seconds is ignored", () => {
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", 1)).toBe(2_000);
    expect(retryAfterMs("", 0)).toBe(1_000);
  });
});
