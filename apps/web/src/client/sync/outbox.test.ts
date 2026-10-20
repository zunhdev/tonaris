import { describe, expect, test } from "bun:test";

import { uuidv7, type Mutation, type Outcome } from "@tonaris/domain";

import { createOutbox, type QueuedState, type Sent } from "./outbox";

const mutation = (title: string): Mutation => ({
  mutationId: uuidv7(),
  name: "album.update",
  args: { id: uuidv7(), title },
  base: { title: "before" },
});

const confirmed = (seq: number): Outcome => ({ status: "confirmed", seq, result: null });

describe("outbox (TS-22)", () => {
  test("sends one at a time, and holds later mutations behind an unanswered one", async () => {
    const sends: string[] = [];
    let unanswered = 2;
    const outbox = createOutbox({
      backoff: { minMs: 1, maxMs: 5 },
      send: (sent): Promise<Sent> => {
        sends.push(sent.mutationId);
        if (unanswered > 0) {
          unanswered -= 1;
          return Promise.resolve({ unanswered: new TypeError("Failed to fetch") });
        }
        return Promise.resolve({ answered: confirmed(sends.length) });
      },
    });
    const [first, second] = [mutation("A"), mutation("B")];
    const outcomes = await Promise.all([outbox.enqueue(first), outbox.enqueue(second)]);

    expect(sends).toEqual([
      first.mutationId,
      first.mutationId,
      first.mutationId,
      second.mutationId,
    ]);
    expect(outcomes).toEqual([confirmed(3), confirmed(4)]);
    expect(outbox.queued).toEqual([]);
  });

  test("reports pending, then unconfirmed for a send without an answer", async () => {
    const states: QueuedState[] = [];
    let answered = false;
    const outbox = createOutbox({
      backoff: { minMs: 1, maxMs: 5 },
      onState: (_, state) => states.push(state),
      send: () => {
        const sent: Sent = answered
          ? { answered: confirmed(1) }
          : { unanswered: new Error("timeout") };
        answered = true;
        return Promise.resolve(sent);
      },
    });
    await outbox.enqueue(mutation("A"));
    expect(states).toEqual(["pending", "unconfirmed"]);
  });

  test("retries at once when woken, rather than waiting out the backoff", async () => {
    let calls = 0;
    const outbox = createOutbox({
      backoff: { minMs: 60_000, maxMs: 60_000 },
      send: () => {
        calls += 1;
        return Promise.resolve(
          calls === 1 ? { unanswered: new Error("offline") } : { answered: confirmed(1) },
        );
      },
    });
    const outcome = outbox.enqueue(mutation("A"));
    await Bun.sleep(10);
    outbox.wake();
    expect(await outcome).toEqual(confirmed(1));
  });
});
