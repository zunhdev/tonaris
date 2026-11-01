// Sending captures (TON-45, TS-22): each pasted link is one `album.capture`, sent as its own request in the capture
// lane, so each settles as it finishes and none holds up the edits made after it. Links sent together are one batch,
// reported together (FR-02.11, DS-84). A capture is tracked like any write, so its state shows in its row, Activity
// and the report; a confirmed one settles once the stream has brought its album, so the row gives way to it without
// a flicker. A capture has no optimistic record: its row is its pending state.

import { uuidv7, type CaptureArgs, type Mutation, type Outcome } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Outbox } from "./outbox";
import type { OutboxEntry, OutboxItem } from "./persistence";
import type { SaveState, SaveStates } from "./save-states";
import { envelope } from "./writes";

/** What a capture is asked with; `albumId` is made when not given, as for a new album (TS-10). */
export type CaptureRequest = Omit<CaptureArgs, "albumId"> & { albumId?: string };

export type Captures = ReturnType<typeof createCaptures>;

export function createCaptures({
  outbox,
  engine,
  states,
}: {
  /** The capture lane. */
  outbox: Outbox;
  engine: SyncEngine;
  states: SaveStates;
}) {
  /** Settles a capture from its outcome: a confirmed one once the stream has delivered it. */
  async function settle({ mutation }: OutboxItem, outcome: Outcome | undefined): Promise<void> {
    if (!outcome) return;
    if (outcome.status === "confirmed") await engine.awaitSeq(outcome.seq);
    states.settle(mutation.mutationId, outcome);
  }

  /**
   * Captures each request: one request each, in the order given, reported as one batch when there are several, or
   * joining the report a retry is made from. Answers the writes, as their save states know them.
   */
  function send(requests: readonly CaptureRequest[]): Mutation[] {
    const batch = states.batchFor(requests.length);
    const items: OutboxItem[] = requests.map(({ albumId = uuidv7(), ...rest }) => ({
      mutation: envelope("album.capture", { albumId, ...rest }),
      key: albumId,
    }));
    for (const { mutation, key } of items) states.track(mutation, key, "pending", batch);
    for (const item of items) {
      void outbox.enqueue([item]).then(([outcome]) => settle(item, outcome));
    }
    return items.map((item) => item.mutation);
  }

  return {
    send,

    /**
     * Sends a capture that needed the person again with their answer, a candidate's `releaseGroupId` or the album's
     * `details` (TS-26), and the destination if they changed it, into the same batch report, and dismisses the old
     * one. Answers the new write.
     */
    again(
      state: SaveState,
      answer: Partial<Pick<CaptureArgs, "releaseGroupId" | "details" | "listId">>,
    ): Mutation | undefined {
      if (state.mutation.name !== "album.capture") return undefined;
      const { releaseGroupId: _, details: __, ...args } = state.mutation.args;
      const make = () => send([{ ...args, ...answer }]);
      const [sent] = state.batch === undefined ? make() : states.within(state.batch, make);
      states.dismiss(state.mutation.mutationId);
      return sent;
    },

    /** Tracks a capture adopted from a reloaded tab: unconfirmed until its outcome arrives. */
    restored(entry: OutboxEntry, outcomes: Promise<Outcome[]>): void {
      for (const { mutation, key } of entry.items) states.track(mutation, key, "unconfirmed");
      void outcomes.then((answered) =>
        Promise.all(entry.items.map((item, index) => settle(item, answered[index]))),
      );
    },
  };
}
