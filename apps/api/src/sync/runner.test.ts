// What the mutation runner's announcer hands on after a write (TS-23, TON-70): a write's changes to the account's
// streams, and a confirmed write without any to its guest pages; a replay or a refusal announces nothing.

import { describe, expect, test } from "bun:test";

import type { ExecutedMutation } from "@tonaris/db";
import { failure, type Change } from "@tonaris/domain";

import { announcer } from "./runner";

const accountId = "anna";
const mutationId = "01a1886e-9df0-726c-a42e-a0b5e0e7bf19";

const change: Change = {
  seq: 1,
  entity: "album",
  id: "01a1886e-9df0-726c-a42e-a0b5e0e7bf20",
  op: "insert",
  data: null,
  mutationId,
};

/** An announcer on a hub that records what it was told. */
function recorded() {
  const published: (readonly Change[])[] = [];
  const notified: string[] = [];
  const announce = announcer({
    publish: (_, changes) => published.push(changes),
    notify: (id) => notified.push(id),
  });
  return { announce, published, notified };
}

const executed = (overrides: Partial<ExecutedMutation> = {}): ExecutedMutation => ({
  result: { mutationId, outcome: { status: "confirmed", seq: 1, result: null } },
  changes: [],
  replayed: false,
  ...overrides,
});

describe("announcer (TS-23, TON-70)", () => {
  test("publishes a write's changes", () => {
    const { announce, published, notified } = recorded();
    announce(accountId, executed({ changes: [change] }));
    expect(published).toEqual([[change]]);
    expect(notified).toEqual([]);
  });

  test("tells the guest pages about a confirmed write without changes", () => {
    const { announce, published, notified } = recorded();
    announce(accountId, executed());
    expect(published).toEqual([]);
    expect(notified).toEqual([accountId]);
  });

  test("announces nothing for a replay or a refusal", () => {
    const { announce, published, notified } = recorded();
    announce(accountId, executed({ replayed: true }));
    announce(
      accountId,
      executed({
        result: { mutationId, outcome: failure("not_found", "There is no such album.") },
      }),
    );
    expect(published).toEqual([]);
    expect(notified).toEqual([]);
  });
});
