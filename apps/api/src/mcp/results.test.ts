// How tools present albums, pages and writes to agents (TS-15, TS-27, TS-65).

import { describe, expect, test } from "bun:test";

import { failure } from "@tonaris/domain";
import { policy, withheld } from "@tonaris/providers";

import {
  agentAlbum,
  answerWritten,
  keyReused,
  nextCursor,
  offsetOf,
  summaryKeys,
  tooMany,
} from "./results";

const album = {
  id: "01a1886e-9df0-726c-a42e-a0b5e0e7bf19",
  title: "Nightfall",
  artistCredit: "Candlemass",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1987,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  sources: { title: "musicbrainz" as const, originalYear: "user" as const },
};

describe("agentAlbum (TS-15)", () => {
  test("passes every value today's policy allows, and never the sources", () => {
    expect(agentAlbum(album, summaryKeys)).toEqual({
      id: album.id,
      title: "Nightfall",
      artistCredit: "Candlemass",
      originalYear: 1987,
      releaseType: "album",
    });
  });

  test("replaces a value from a source agents may not see with the marker", () => {
    const closed = { ...policy, musicbrainz: { ...policy.musicbrainz, agentVisible: false } };
    expect(agentAlbum(album, ["title", "originalYear"], closed)).toEqual({
      id: album.id,
      title: withheld,
      originalYear: 1987,
    });
  });
});

describe("cursors (TS-65)", () => {
  test("a cursor stands for the next page's offset, until the last page", () => {
    const cursor = nextCursor(0, 200, 205);
    expect(cursor).not.toBeNull();
    expect(offsetOf(cursor ?? undefined)).toBe(200);
    expect(nextCursor(200, 5, 205)).toBeNull();
    expect(offsetOf(undefined)).toBe(0);
    expect(offsetOf("nonsense")).toBeUndefined();
  });
});

describe("a write's answer (TS-27, TS-65)", () => {
  const ids = ["01a1886e-9df0-726c-a42e-a0b5e0e7bf21", "01a1886e-9df0-726c-a42e-a0b5e0e7bf22"];
  const confirmed = { status: "confirmed" as const, seq: 1, result: null };

  test("reports each step with a target, and says Done when every one is", () => {
    const answered = answerWritten(
      {
        idempotencyKey: "key-1",
        items: [
          { mutationId: ids[0] ?? "", outcome: confirmed },
          { mutationId: ids[1] ?? "", outcome: confirmed },
        ],
      },
      // The first step is only the second's way there, so it isn't reported.
      [undefined, { albumId: "album-1" }],
    );
    expect(answered.content[0]?.text).toBe("Done: 1 confirmed.");
    const structured: unknown = answered.structuredContent;
    expect(structured).toEqual({
      idempotencyKey: "key-1",
      items: [{ albumId: "album-1", outcome: { status: "confirmed" } }],
    });
  });

  test("says Not all done when a step didn't succeed, and leads with the head", () => {
    const answered = answerWritten(
      {
        idempotencyKey: "key-2",
        items: [
          { mutationId: ids[0] ?? "", outcome: confirmed },
          { mutationId: ids[1] ?? "", outcome: failure("not_found", "There is no such option.") },
        ],
      },
      [{ optionId: "a" }, { optionId: "b" }],
      { status: "ran" },
    );
    expect(answered.content[0]?.text).toBe("Not all done: 1 confirmed, 1 failed.");
    expect(Object.keys(answered.structuredContent)).toEqual(["status", "idempotencyKey", "items"]);
    const failedStep: unknown = answered.structuredContent.items[1];
    expect(failedStep).toEqual({
      optionId: "b",
      outcome: { status: "failed", code: "not_found", message: "There is no such option." },
    });
  });

  test("a reused key and too large a call fail, with what to do", () => {
    expect(keyReused().structuredContent).toEqual({
      status: "failed",
      code: "validation_failed",
      message:
        "This idempotencyKey was already used for a different change, so nothing was done. Use a new key for a new change.",
    });
    expect(tooMany(200, "items").structuredContent.message).toBe(
      "That is more than 200 items in one call. Split it.",
    );
  });
});
