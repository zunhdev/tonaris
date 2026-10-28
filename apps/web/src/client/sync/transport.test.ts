// What the transport makes of an answer (TS-22, TON-45): a capture still running is no answer yet, so the outbox sends
// the entry again; any other refusal with a problem fails the writes.

import { describe, expect, test } from "bun:test";

import { failure, uuidv7 } from "@tonaris/domain";

import type { OutboxEntry } from "./persistence";
import { entrySender } from "./transport";

const entry: OutboxEntry = {
  id: uuidv7(),
  tab: "tab",
  lane: "capture",
  createdAt: 1,
  items: [
    {
      key: "a",
      mutation: {
        mutationId: uuidv7(),
        name: "album.capture",
        args: {
          albumId: uuidv7(),
          link: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
          listId: null,
        },
      },
    },
  ],
};

/** A fetch answering every request with `problem`. */
const answering = (problem: ReturnType<typeof failure>["problem"]) => () =>
  Promise.resolve(
    new Response(JSON.stringify(problem), {
      status: problem.status,
      headers: { "content-type": "application/problem+json" },
    }),
  );

describe("entrySender (TS-22)", () => {
  test("a capture still running is no answer yet", async () => {
    const running = failure("in_progress", "This change is still being saved.").problem;
    const sent = await entrySender("http://api", answering(running))(entry);
    expect("unanswered" in sent).toBe(true);
  });

  test("any other refusal fails the writes", async () => {
    const refused = failure("validation_failed", "No.").problem;
    const sent = await entrySender("http://api", answering(refused))(entry);
    expect(sent).toEqual({
      answered: [{ status: "failed", code: "validation_failed", problem: refused }],
    });
  });
});
