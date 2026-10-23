import { describe, expect, test } from "bun:test";

import { PacedQueue } from "./paced-queue";

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
