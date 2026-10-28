import { describe, expect, test } from "bun:test";

import { uuidv7, type CaptureResult } from "@tonaris/domain";

import { captureNeed, confirmedToast, keptLinkToast, needReason, shownLink } from "./outcomes";

const result = (values: Partial<CaptureResult> = {}): CaptureResult => ({
  albumId: uuidv7(),
  match: "created",
  alreadyInList: false,
  keptLink: null,
  ...values,
});
const into = { title: "Bleach", listName: "Grunge", shown: true };
const nowhere = { title: "Bleach", listName: null, shown: false };

describe("outcome toasts (DS-48)", () => {
  test("a new album's row is enough; elsewhere it is named, with Add to list for Unsorted", () => {
    expect(confirmedToast(result(), into)).toBeUndefined();
    expect(confirmedToast(result(), { ...into, shown: false })).toEqual({
      title: "Added 'Bleach' to 'Grunge'",
    });
    expect(confirmedToast(result(), nowhere)).toEqual({
      title: "Added 'Bleach' to Unsorted",
      addToList: true,
    });
  });

  test("reused, already in the list, and restored", () => {
    expect(confirmedToast(result({ match: "reused" }), into)?.title).toBe(
      "Already in your collection — added to this list",
    );
    expect(confirmedToast(result({ match: "reused" }), nowhere)).toEqual({
      title: "Already in your collection",
      addToList: true,
    });
    expect(confirmedToast(result({ match: "reused", alreadyInList: true }), into)?.title).toBe(
      "Already in this list",
    );
    expect(confirmedToast(result({ match: "restored" }), into)?.title).toBe(
      "Restored from Trash and added",
    );
    expect(confirmedToast(result({ match: "restored" }), nowhere)?.title).toBe(
      "Restored from Trash",
    );
  });

  test("a kept link names its service", () => {
    expect(keptLinkToast({ service: "apple-music", kept: "a", pasted: "b" })).toBe(
      "Kept your existing Apple Music link",
    );
  });
});

describe("what a capture asks (TS-26)", () => {
  test("a choice between albums", () => {
    const outcome = {
      status: "needs_input" as const,
      need: "match" as const,
      candidates: [
        { releaseGroupId: "a", title: "The Last in Line", albumId: null },
        { releaseGroupId: "b", title: "Holy Diver", albumId: "x" },
        { unexpected: true },
      ],
    };
    expect(captureNeed(outcome)).toEqual({
      need: "match",
      candidates: [
        { releaseGroupId: "a", title: "The Last in Line", albumId: null },
        { releaseGroupId: "b", title: "Holy Diver", albumId: "x" },
      ],
    });
    expect(needReason(outcome)).toBe("This link fits more than one album. Choose which it is.");
  });

  test("the album's details, with the reason and the prefill", () => {
    const reason =
      "A Tidal track link doesn't say which album it's on. Enter the album's details; the link is kept.";
    const outcome = {
      status: "needs_input" as const,
      need: "details" as const,
      candidates: [
        {
          service: "tidal",
          url: "https://tidal.com/track/1",
          reason,
          prefill: { source: "itunes-lookup", values: { title: "Idéal", originalYear: 1983 } },
        },
      ],
    };
    expect(captureNeed(outcome)).toMatchObject({
      need: "details",
      details: { service: "tidal", prefill: { values: { title: "Idéal" } } },
    });
    expect(needReason(outcome)).toBe(reason);
    expect(needReason({ status: "confirmed", seq: 1, result: null })).toBeUndefined();
  });

  test("a link is shown without its scheme", () => {
    expect(shownLink("https://open.spotify.com/album/1?si=x")).toBe(
      "open.spotify.com/album/1?si=x",
    );
    expect(shownLink("not a link")).toBe("not a link");
  });
});
